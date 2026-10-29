import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { PRACTISABLE_ITEM } from '../../queries/practisable';
import { ConceptTitleSchema } from '../../schemas/concept';
import { importCefrJ } from '../import';
import { type CefrJEntry, normalizeDataset } from '../normalize';

/**
 * The CEFR-J import against a real, migrated Postgres: the CHECKs on what it
 * writes, idempotency, that review is never undone, and that nothing it
 * writes reaches the grammar selection pool. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Lexemes and concepts carry this run's
 * tag and are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the CEFR-J import DB tests would be skipped');
}

const RUN = `test-cefrj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const fixture = (entries: CefrJEntry[]) =>
  normalizeDataset({
    source: {
      name: 'CEFR-J Wordlist',
      version: 'test',
      citation: 'c',
      url: 'https://example.org/cefrj.csv',
      terms: 't',
      selection: 's',
      topics: 'x',
    },
    entries,
  }).lexemes;

const ENTRIES: CefrJEntry[] = [
  { lemma: `${RUN}-Apple`, pos: 'noun', cefrJLevel: 'A1', topic: 'food_drink' },
  { lemma: `${RUN}-bake`, pos: 'verb', cefrJLevel: 'A2', topic: 'food_drink' },
  { lemma: `${RUN}-feast`, pos: 'noun', cefrJLevel: 'B1', topic: 'food_drink' },
  { lemma: `${RUN}-March`, pos: 'noun', sense: 'month', cefrJLevel: 'A1', topic: 'daily_life' },
  { lemma: `${RUN}-march`, pos: 'noun', sense: 'walk', cefrJLevel: 'B1' },
  { lemma: `${RUN}-march`, pos: 'verb', cefrJLevel: 'B1' },
  { lemma: `${RUN}-the`, pos: 'determiner', cefrJLevel: 'A1' },
];

describe.skipIf(!url)('CEFR-J import (real Postgres)', () => {
  let db: PrismaClient;
  const lexemes = fixture(ENTRIES);
  const run = (entries = lexemes) => importCefrJ(db, entries, { conceptPrefix: RUN, chunkSize: 2 });

  const ours = { lemmaKey: { startsWith: RUN } };
  const ourConcepts = { id: { startsWith: `${RUN}.` } };

  beforeAll(async () => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: ourConcepts });
    await db.$disconnect();
  });

  it('writes DRAFT lexemes with empty glosses, in chunks', async () => {
    const report = await run();
    expect(report).toEqual({
      concepts: { created: 5, total: 5 },
      edges: { created: 2, total: 2 },
      lexemes: { created: 6, updated: 0, unchanged: 0 },
      chunks: 3,
    });

    const rows = await db.lexeme.findMany({
      where: ours,
      orderBy: [{ lemmaKey: 'asc' }, { pos: 'asc' }],
    });
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'DRAFT',
        definitions: {},
        translations: {},
        examples: [],
        collocations: [],
      });
      expect(row.lemmaKey).toBe(row.lemma.toLowerCase());
      expect(row.cefrJLevel).toBe(row.cefrLevel);
    }
    expect(rows.find((r) => r.lemma === `${RUN}-Apple`)?.lemmaKey).toBe(`${RUN}-apple`);
    expect(
      rows.filter((r) => r.lemmaKey === `${RUN}-march`).map((r) => [r.lemma, r.pos, r.sense]),
    ).toEqual([
      [`${RUN}-March`, 'NOUN', 'month'],
      [`${RUN}-march`, 'NOUN', 'walk'],
      [`${RUN}-march`, 'VERB', ''],
    ]);
  });

  it('creates one VOCAB concept per topic and level, linked by RELATED edges only', async () => {
    const concepts = await db.concept.findMany({ where: ourConcepts, orderBy: { id: 'asc' } });
    expect(concepts.map((c) => [c.id, c.cefrLevel, c.category])).toEqual([
      [`${RUN}.daily_life.a1`, 'A1', 'VOCAB'],
      [`${RUN}.food_drink.a1`, 'A1', 'VOCAB'],
      [`${RUN}.food_drink.a2`, 'A2', 'VOCAB'],
      [`${RUN}.food_drink.b1`, 'B1', 'VOCAB'],
      [`${RUN}.general.b1`, 'B1', 'VOCAB'],
    ]);
    for (const c of concepts) expect(ConceptTitleSchema.safeParse(c.title).success).toBe(true);

    const edges = await db.conceptEdge.findMany({
      where: { OR: [{ from: ourConcepts }, { to: ourConcepts }] },
      orderBy: { fromId: 'asc' },
    });
    expect(edges.map((e) => [e.fromId, e.toId, e.kind])).toEqual([
      [`${RUN}.food_drink.a1`, `${RUN}.food_drink.a2`, 'RELATED'],
      [`${RUN}.food_drink.a2`, `${RUN}.food_drink.b1`, 'RELATED'],
    ]);
  });

  it('is idempotent: a second run writes nothing', async () => {
    const before = await Promise.all([
      db.lexeme.count({ where: ours }),
      db.concept.count({ where: ourConcepts }),
      db.conceptEdge.count({ where: { from: ourConcepts } }),
    ]);
    const report = await run();
    expect(report).toMatchObject({
      concepts: { created: 0 },
      edges: { created: 0 },
      lexemes: { created: 0, updated: 0, unchanged: 6 },
    });
    expect(
      await Promise.all([
        db.lexeme.count({ where: ours }),
        db.concept.count({ where: ourConcepts }),
        db.conceptEdge.count({ where: { from: ourConcepts } }),
      ]),
    ).toEqual(before);
  });

  // Axiom 6: imported vocabulary never enters the grammar selection pool.
  it('writes no Item, so no imported concept is practisable', async () => {
    const lexemeIds = (await db.lexeme.findMany({ where: ours, select: { id: true } })).map(
      (l) => l.id,
    );
    expect(await db.item.count({ where: { lexemeId: { in: lexemeIds } } })).toBe(0);
    expect(await db.item.count({ where: { concept: ourConcepts } })).toBe(0);

    const practisable = await db.$queryRaw<{ id: string }[]>`
      SELECT c."id" FROM "Concept" c
      WHERE c."id" LIKE ${`${RUN}.%`}
        AND EXISTS (SELECT 1 FROM "Item" i WHERE i."conceptId" = c."id" AND ${PRACTISABLE_ITEM})
    `;
    expect(practisable).toEqual([]);
  });

  it('updates only the source columns on a re-run and never undoes review', async () => {
    const apple = { lemmaKey: `${RUN}-apple`, pos: 'NOUN' as const, sense: '' };
    await db.lexeme.update({
      where: { lemmaKey_pos_sense: apple },
      data: {
        status: 'PUBLISHED',
        definitions: { en: 'a round fruit' },
        translations: { ru: 'яблоко' },
      },
    });

    const releveled = fixture(
      ENTRIES.map((e) => (e.lemma === `${RUN}-Apple` ? { ...e, cefrJLevel: 'A2' } : e)),
    );
    const report = await run(releveled);
    expect(report.lexemes).toEqual({ created: 0, updated: 1, unchanged: 5 });

    expect(await db.lexeme.findUnique({ where: { lemmaKey_pos_sense: apple } })).toMatchObject({
      cefrLevel: 'A2',
      cefrJLevel: 'A2',
      status: 'PUBLISHED',
      definitions: { en: 'a round fruit' },
      translations: { ru: 'яблоко' },
    });
  });
});
