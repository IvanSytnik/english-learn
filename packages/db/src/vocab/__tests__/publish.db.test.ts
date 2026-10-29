import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { PRACTISABLE_ITEM } from '../../queries/practisable';
import { importCefrJ } from '../import';
import { type CefrJEntry, normalizeDataset } from '../normalize';
import { publishVocab, VocabPublishError } from '../publish';

/**
 * vocab:publish against a real, migrated Postgres: REVIEW lexemes become
 * PUBLISHED with exactly one question-less VOCAB_WORD item on their topic
 * concept; re-runs (and concurrent runs) write nothing new; any problem stops
 * the run before a single write; nothing reaches the grammar pool. Same gate
 * as the other DB tests (DIAG_DB_TEST_URL; required in CI). Rows carry this
 * run's tag and are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the vocab publish DB tests would be skipped');
}

const RUN = `test-publish-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
  { lemma: `${RUN}-apple`, pos: 'noun', cefrJLevel: 'A1', topic: 'food_drink' },
  {
    lemma: `${RUN}-color`,
    variants: [`${RUN}-colour`],
    pos: 'noun',
    cefrJLevel: 'A1',
    topic: 'free_time',
  },
  { lemma: `${RUN}-bake`, pos: 'verb', cefrJLevel: 'A2', topic: 'food_drink' },
  { lemma: `${RUN}-feast`, pos: 'noun', cefrJLevel: 'B1', topic: 'food_drink' },
  { lemma: `${RUN}-draft`, pos: 'noun', cefrJLevel: 'B1', topic: 'food_drink' },
];
const DATASET = fixture(ENTRIES);
const REVIEWED = [`${RUN}-apple`, `${RUN}-color`, `${RUN}-bake`, `${RUN}-feast`];

const ours = { lemmaKey: { startsWith: RUN } };

describe.skipIf(!url)('vocab:publish (real Postgres)', () => {
  let db: PrismaClient;
  const publish = (opts: Parameters<typeof publishVocab>[2] = {}, dataset = DATASET) =>
    publishVocab(db, dataset, { conceptPrefix: RUN, lemmaKeyPrefix: RUN, chunkSize: 2, ...opts });

  const review = (lemmaKey: string) =>
    db.lexeme.updateMany({
      where: { lemmaKey },
      data: {
        status: 'REVIEW',
        definitions: { en: 'a thing' },
        translations: { ru: 'вещь', uk: 'річ', de: 'das Ding' },
        examples: [
          {
            sentence: `I like ${lemmaKey}.`,
            translation: { ru: 'x', uk: 'x', de: 'x' },
            clozeTarget: lemmaKey,
          },
        ],
      },
    });

  const items = () =>
    db.item.findMany({
      where: { lexeme: ours },
      include: { lexeme: true },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
  });

  beforeEach(async () => {
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: { id: { startsWith: `${RUN}.` } } });
    await importCefrJ(db, DATASET, { conceptPrefix: RUN });
    for (const key of REVIEWED) await review(key);
  });

  afterAll(async () => {
    if (!db) return;
    await db.item.deleteMany({ where: { lexeme: ours } });
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: { id: { startsWith: `${RUN}.` } } });
    await db.$disconnect();
  });

  it('publishes REVIEW lexemes with one question-less item on the topic concept', async () => {
    const report = await publish();
    expect(report).toMatchObject({ published: 4, itemsCreated: 4, repaired: 0, chunks: 2 });

    const rows = await items();
    expect(rows).toHaveLength(4);
    for (const item of rows) {
      expect(item).toMatchObject({
        kind: 'VOCAB_WORD',
        status: 'PUBLISHED',
        hasPractice: false,
        cefrLevel: item.lexeme?.cefrLevel,
      });
      expect(item.lexeme?.status).toBe('PUBLISHED');
    }
    const color = rows.find((r) => r.lexeme?.lemmaKey === `${RUN}-color`);
    expect(color?.conceptId).toBe(`${RUN}.free_time.a1`);
    expect(color?.content).toEqual({ headword: `${RUN}-color`, variants: [`${RUN}-colour`] });
    expect(rows.find((r) => r.lexeme?.lemmaKey === `${RUN}-bake`)?.conceptId).toBe(
      `${RUN}.food_drink.a2`,
    );
  });

  it('leaves DRAFT lexemes alone', async () => {
    await publish();
    const draft = await db.lexeme.findFirstOrThrow({
      where: { lemmaKey: `${RUN}-draft` },
      include: { items: true },
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.items).toHaveLength(0);
  });

  it('is idempotent: a re-run writes nothing', async () => {
    await publish();
    const before = await items();
    await expect(publish()).resolves.toMatchObject({ published: 0, itemsCreated: 0, chunks: 0 });
    expect(await items()).toEqual(before);
  });

  it('repairs a PUBLISHED lexeme that lost its item', async () => {
    await publish();
    await db.item.deleteMany({ where: { lexeme: { lemmaKey: `${RUN}-apple` } } });
    await expect(publish()).resolves.toMatchObject({ published: 0, itemsCreated: 1, repaired: 1 });
    expect(await items()).toHaveLength(4);
  });

  it('never doubles an item under concurrent runs', async () => {
    await Promise.all([publish(), publish(), publish()]);
    const rows = await items();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.lexemeId)).size).toBe(4);
  });

  it('publishes one level with --level', async () => {
    await expect(publish({ level: 'A1' })).resolves.toMatchObject({ published: 2 });
    const rows = await items();
    expect(rows.map((r) => r.cefrLevel)).toEqual(['A1', 'A1']);
  });

  it('writes nothing on a dry run', async () => {
    const report = await publish({ dryRun: true });
    expect(report.published).toBe(4);
    expect([...report.perConcept].sort()).toEqual([
      [`${RUN}.food_drink.a1`, 1],
      [`${RUN}.food_drink.a2`, 1],
      [`${RUN}.food_drink.b1`, 1],
      [`${RUN}.free_time.a1`, 1],
    ]);
    expect(await items()).toHaveLength(0);
    expect(await db.lexeme.count({ where: { ...ours, status: 'PUBLISHED' } })).toBe(0);
  });

  it('keeps every item out of the grammar pool (PRACTISABLE_ITEM)', async () => {
    await publish();
    const [row] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Item" i JOIN "Lexeme" l ON l.id = i."lexemeId"
      WHERE l."lemmaKey" LIKE ${`${RUN}%`} AND ${PRACTISABLE_ITEM}`;
    expect(row?.n).toBe(0n);
  });

  it('fails before any write when a lexeme is not in the dataset', async () => {
    const partial = DATASET.filter((l) => l.lemmaKey !== `${RUN}-feast`);
    await expect(publish({}, partial)).rejects.toThrow(/not in the CEFR-J dataset/);
    expect(await items()).toHaveLength(0);
    expect(await db.lexeme.count({ where: { ...ours, status: 'PUBLISHED' } })).toBe(0);
  });

  it('fails before any write when a topic concept is missing', async () => {
    await db.concept.delete({ where: { id: `${RUN}.food_drink.b1` } });
    await expect(publish()).rejects.toThrow(VocabPublishError);
    await expect(publish()).rejects.toThrow(/food_drink\.b1/);
    expect(await items()).toHaveLength(0);
  });

  it('fails before any write on a lexeme without an example', async () => {
    await db.lexeme.updateMany({ where: { lemmaKey: `${RUN}-bake` }, data: { examples: [] } });
    await expect(publish()).rejects.toThrow(/bake.*no example sentence/);
    expect(await items()).toHaveLength(0);
  });

  it('fails before any write on an incomplete REVIEW lexeme', async () => {
    await db.lexeme.updateMany({ where: { lemmaKey: `${RUN}-bake` }, data: { translations: {} } });
    await expect(publish()).rejects.toThrow(VocabPublishError);
    expect(await items()).toHaveLength(0);
  });
});
