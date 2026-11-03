import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import type { FrequencyDataset } from '../frequency';
import { syncFrequency } from '../frequency';
import { importCefrJ } from '../import';
import { type CefrJEntry, normalizeDataset } from '../normalize';
import { publishVocab } from '../publish';
import { syncCollections } from '../sync-collections';

/**
 * vocab:sync-frequency and vocab:sync-collections against a real Postgres
 * (B6.2): values and ranks land, re-runs write nothing, a dry run writes
 * nothing, and collections never touch an item or its concept (V2-6). Same
 * gate as the other DB tests. Rows carry this run's tag and are deleted.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the catalogue sync DB tests would be skipped',
  );
}

const RUN = `test-csync-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const k = (w: string) => `${RUN}-${w}`;

const ENTRIES: CefrJEntry[] = [
  {
    lemma: k('apple'),
    pos: 'noun',
    cefrJLevel: 'A1',
    topic: 'food_drink',
    collections: ['food_drink'],
  },
  { lemma: k('bake'), pos: 'verb', cefrJLevel: 'A2', topic: 'food_drink' },
  // Same tag set as apple: one statement must write both.
  {
    lemma: k('bread'),
    pos: 'noun',
    cefrJLevel: 'A1',
    topic: 'food_drink',
    collections: ['food_drink'],
  },
  {
    lemma: k('chef'),
    pos: 'noun',
    cefrJLevel: 'B1',
    topic: 'food_drink',
    collections: ['work_jobs', 'food_drink'],
  },
  { lemma: k('draft'), pos: 'noun', cefrJLevel: 'B1', topic: 'food_drink' },
];
const DATASET = normalizeDataset({
  source: {
    name: 'CEFR-J Wordlist',
    version: 'test',
    citation: 'c',
    url: 'https://example.org/cefrj.csv',
    terms: 't',
    selection: 's',
    topics: 'x',
  },
  entries: ENTRIES,
}).lexemes;
const FREQ: FrequencyDataset = {
  source: { name: 'wordfreq', version: 'test', licence: 'CC BY-SA 4.0', attribution: 'a' },
  entries: { [k('apple')]: 4.5, [k('bake')]: 3.9, [k('chef')]: 4.5, [k('draft')]: 5.1 },
};
const ours = { lemmaKey: { startsWith: RUN } };

describe.skipIf(!url)('catalogue sync: frequency and collections (real Postgres)', () => {
  let db: PrismaClient;
  const lexemes = () =>
    db.lexeme.findMany({
      where: ours,
      select: {
        lemmaKey: true,
        frequencyZipf: true,
        frequencyRank: true,
        collections: true,
        updatedAt: true,
      },
      orderBy: { lemmaKey: 'asc' },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
  });

  beforeEach(async () => {
    await db.item.deleteMany({ where: { lexeme: ours } });
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: { id: { startsWith: `${RUN}.` } } });
    await importCefrJ(db, DATASET, { conceptPrefix: RUN });
    // Three words reviewed and published; `draft` stays DRAFT.
    await db.lexeme.updateMany({
      where: { lemmaKey: { in: [k('apple'), k('bake'), k('chef')] } },
      data: {
        status: 'REVIEW',
        definitions: { en: 'a thing' },
        translations: { ru: 'вещь', uk: 'річ', de: 'das Ding' },
        examples: [
          {
            sentence: 'A thing.',
            translation: { ru: 'x', uk: 'x', de: 'x' },
            clozeTarget: 'thing',
          },
        ],
      },
    });
    await publishVocab(db, DATASET, { conceptPrefix: RUN, lemmaKeyPrefix: RUN });
  });

  afterAll(async () => {
    if (!db) return;
    await db.item.deleteMany({ where: { lexeme: ours } });
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: { id: { startsWith: `${RUN}.` } } });
    await db.$disconnect();
  });

  it('frequency: zipf on every lexeme, a dense rank on the PUBLISHED ones; a re-run writes nothing', async () => {
    const dry = await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN, dryRun: true });
    expect(dry).toMatchObject({ lexemes: 5, withFrequency: 4, ranked: 3, changed: 4, chunks: 0 });
    expect((await lexemes()).every((l) => l.frequencyZipf === null)).toBe(true);

    expect(await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN, chunkSize: 3 })).toMatchObject({
      changed: 4,
      chunks: 2,
    });
    expect((await lexemes()).map((l) => [l.lemmaKey, l.frequencyZipf, l.frequencyRank])).toEqual([
      [k('apple'), 4.5, 1], // tie with chef at 4.5, apple < chef
      [k('bake'), 3.9, 3],
      [k('bread'), null, null], // not in the frequency data, DRAFT
      [k('chef'), 4.5, 2],
      [k('draft'), 5.1, null], // most frequent, but DRAFT: no rank
    ]);
    const before = await lexemes();
    expect(await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
      chunks: 0,
    });
    expect(await lexemes()).toEqual(before);
  });

  it('collections: tags land, re-run writes nothing, items and their concepts are untouched', async () => {
    const items = () =>
      db.item.findMany({
        where: { lexeme: ours },
        select: { id: true, conceptId: true, updatedAt: true },
        orderBy: { id: 'asc' },
      });
    const itemsBefore = await items();
    expect(itemsBefore).toHaveLength(3);

    expect(await syncCollections(db, DATASET, { lemmaKeyPrefix: RUN, dryRun: true })).toMatchObject(
      {
        inDataset: 5,
        tagged: 3,
        changed: 3,
        chunks: 0,
      },
    );
    expect((await lexemes()).every((l) => l.collections.length === 0)).toBe(true);

    // Two tag sets (apple + bread share one) → two statements.
    expect(await syncCollections(db, DATASET, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 3,
      chunks: 2,
    });
    expect((await lexemes()).map((l) => [l.lemmaKey, l.collections])).toEqual([
      [k('apple'), ['food_drink']],
      [k('bake'), []],
      [k('bread'), ['food_drink']],
      [k('chef'), ['work_jobs', 'food_drink']],
      [k('draft'), []],
    ]);
    expect(await items()).toEqual(itemsBefore);
    expect(await syncCollections(db, DATASET, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
    });
  });
});
