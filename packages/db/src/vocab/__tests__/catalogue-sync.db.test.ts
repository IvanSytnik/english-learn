import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import type { ExamplesSnapshot } from '../examples-snapshot';
import { syncExamples } from '../examples-snapshot';
import type { FrequencyDataset } from '../frequency';
import { shadowedIdentities, syncFrequency } from '../frequency';
import { importCefrJ } from '../import';
import { syncIpa } from '../ipa-data';
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
  // B6.2a: a homograph (go verb A1 primary, go noun B1 secondary) and a closed-class word.
  { lemma: k('go'), pos: 'verb', cefrJLevel: 'A1', topic: 'food_drink' },
  { lemma: k('go'), pos: 'noun', cefrJLevel: 'B1', topic: 'food_drink' },
  { lemma: k('of'), pos: 'preposition', cefrJLevel: 'A1', topic: 'food_drink' },
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
  entries: {
    [k('apple')]: 4.5,
    [k('bake')]: 3.9,
    [k('chef')]: 4.5,
    [k('draft')]: 5.1,
    [k('go')]: 6,
    [k('of')]: 7,
  },
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
      orderBy: [{ lemmaKey: 'asc' }, { pos: 'asc' }],
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
  });

  beforeEach(async () => {
    await db.item.deleteMany({ where: { lexeme: ours } });
    await db.lexeme.deleteMany({ where: ours });
    await db.concept.deleteMany({ where: { id: { startsWith: `${RUN}.` } } });
    await importCefrJ(db, DATASET, { conceptPrefix: RUN });
    // Six lexemes reviewed and published; `draft` and `bread` stay DRAFT.
    await db.lexeme.updateMany({
      where: { lemmaKey: { in: [k('apple'), k('bake'), k('chef'), k('go'), k('of')] } },
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

  it('frequency: zipf on every lexeme, the B6.2a dense rank on the PUBLISHED ones; a re-run writes nothing', async () => {
    const dry = await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN, dryRun: true });
    expect(dry).toMatchObject({ lexemes: 8, withFrequency: 7, ranked: 6, changed: 7, chunks: 0 });
    expect((await lexemes()).every((l) => l.frequencyZipf === null)).toBe(true);

    expect(await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN, chunkSize: 3 })).toMatchObject({
      changed: 7,
      chunks: 3,
    });
    expect((await lexemes()).map((l) => [l.lemmaKey, l.frequencyZipf, l.frequencyRank])).toEqual([
      [k('apple'), 4.5, 2], // tie with chef at 4.5, apple < chef
      [k('bake'), 3.9, 4],
      [k('bread'), null, null], // not in the frequency data, DRAFT
      [k('chef'), 4.5, 3],
      [k('draft'), 5.1, null], // DRAFT: no rank
      [k('go'), 6, 5], // noun B1: a second sense of go, after every primary content word
      [k('go'), 6, 1], // verb A1: the primary sense
      [k('of'), 7, 6], // the most frequent, but closed class: last
    ]);
    const before = await lexemes();
    expect(await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
      chunks: 0,
    });
    expect(await lexemes()).toEqual(before);
  });

  it('frequency (B6.2b): a dataset-shadowed sense ranks as secondary', async () => {
    await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN });
    const shadowed = shadowedIdentities([
      { lemmaKey: k('apple'), pos: 'NOUN', sense: '', shadowedByExcludedPos: true },
    ]);
    expect(await syncFrequency(db, FREQ, { lemmaKeyPrefix: RUN, shadowed })).toMatchObject({
      changed: 4,
    });
    expect(
      (await lexemes())
        .filter((l) => l.frequencyRank !== null)
        .map((l) => [l.lemmaKey, l.frequencyRank]),
    ).toEqual([
      [k('apple'), 5], // shadowed: a secondary sense, after `go` noun (zipf 6 > 4.5)
      [k('bake'), 3],
      [k('chef'), 2],
      [k('go'), 4], // noun B1, secondary, zipf 6
      [k('go'), 1],
      [k('of'), 6],
    ]);
  });

  it('collections: tags land, re-run writes nothing, items and their concepts are untouched', async () => {
    const items = () =>
      db.item.findMany({
        where: { lexeme: ours },
        select: { id: true, conceptId: true, updatedAt: true },
        orderBy: { id: 'asc' },
      });
    const itemsBefore = await items();
    expect(itemsBefore).toHaveLength(6);

    expect(await syncCollections(db, DATASET, { lemmaKeyPrefix: RUN, dryRun: true })).toMatchObject(
      {
        inDataset: 8,
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
      [k('go'), []],
      [k('go'), []],
      [k('of'), []],
    ]);
    expect(await items()).toEqual(itemsBefore);
    expect(await syncCollections(db, DATASET, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
    });
  });

  it('examples: appended after examples[0], a changed first example left alone; dry run and re-run write nothing', async () => {
    const ex = (sentence: string, clozeTarget: string) => ({
      sentence,
      clozeTarget,
      translation: { ru: 'р', uk: 'у', de: 'd' },
    });
    const entry = (w: string, pos: string, base: string, examples: ReturnType<typeof ex>[]) => ({
      lemmaKey: k(w),
      pos,
      sense: '',
      base,
      examples,
    });
    const snapshot: ExamplesSnapshot = {
      source: {
        job: 'examples',
        model: 'm',
        prompt: 'v1',
        updatedAt: '2026-11-03T12:00:00.000Z',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      entries: [
        entry('apple', 'NOUN', 'A thing.', [
          ex('I eat one thing a day.', 'thing'),
          ex('Things fall down.', 'Things'),
        ]),
        // One of the two is already there (punctuation and case aside): only the other is added.
        entry('bake', 'VERB', 'A thing.', [
          ex('a THING', 'THING'),
          ex('We bake things on Sunday.', 'things'),
        ]),
        // examples[0] is not the sentence this pair was made for: untouched.
        entry('chef', 'NOUN', 'Another first sentence.', [
          ex('A chef thing here.', 'thing'),
          ex('Things a chef does.', 'Things'),
        ]),
        entry('nowhere', 'NOUN', 'A thing.', [
          ex('No thing here at all.', 'thing'),
          ex('Things are not here.', 'Things'),
        ]),
      ],
    };
    const examples = async () =>
      Object.fromEntries(
        (
          await db.lexeme.findMany({
            where: { lemmaKey: { in: [k('apple'), k('bake'), k('chef')] } },
            select: { lemmaKey: true, examples: true },
          })
        ).map((l) => [
          l.lemmaKey.slice(RUN.length + 1),
          (l.examples as { sentence: string }[]).map((e) => e.sentence),
        ]),
      );
    const before = await examples();

    const dry = await syncExamples(db, snapshot, { lemmaKeyPrefix: RUN, dryRun: true });
    expect(dry).toMatchObject({
      inSnapshot: 4,
      missing: 1,
      changed: 2,
      examplesAdded: 3,
      chunks: 0,
      written: 0,
    });
    expect(dry.baseChanged).toEqual([`${k('chef')} NOUN`]);
    expect(await examples()).toEqual(before);

    expect(await syncExamples(db, snapshot, { lemmaKeyPrefix: RUN, chunkSize: 1 })).toMatchObject({
      changed: 2,
      written: 2,
      chunks: 2,
    });
    expect(await examples()).toEqual({
      apple: ['A thing.', 'I eat one thing a day.', 'Things fall down.'],
      bake: ['A thing.', 'We bake things on Sunday.'],
      chef: ['A thing.'],
    });
    expect(await syncExamples(db, snapshot, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
      chunks: 0,
    });
  });

  it('examples: a row edited between read and write is not overwritten', async () => {
    const snapshot: ExamplesSnapshot = {
      source: {
        job: 'examples',
        model: 'm',
        prompt: 'v1',
        updatedAt: '2026-11-03T12:00:00.000Z',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      entries: [
        {
          lemmaKey: k('apple'),
          pos: 'NOUN',
          sense: '',
          base: 'A thing.',
          examples: [
            {
              sentence: 'I eat one thing a day.',
              clozeTarget: 'thing',
              translation: { ru: 'р', uk: 'у', de: 'd' },
            },
            {
              sentence: 'Things fall down.',
              clozeTarget: 'Things',
              translation: { ru: 'р', uk: 'у', de: 'd' },
            },
          ],
        },
      ],
    };
    // A reviewer edits the row after the sync has read it.
    const edited = [{ sentence: 'A thing.', clozeTarget: 'thing', translation: { ru: 'новое' } }];
    const racing = {
      lexeme: {
        findMany: async (args: Parameters<typeof db.lexeme.findMany>[0]) => {
          const rows = await db.lexeme.findMany(args);
          await db.lexeme.update({
            where: { lemmaKey_pos_sense: { lemmaKey: k('apple'), pos: 'NOUN', sense: '' } },
            data: { examples: edited },
          });
          return rows;
        },
      },
      $executeRaw: db.$executeRaw.bind(db),
    } as unknown as Pick<PrismaClient, 'lexeme' | '$executeRaw'>;
    expect(await syncExamples(racing, snapshot, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 1,
      written: 0,
    });
    const row = await db.lexeme.findFirst({
      where: { lemmaKey: k('apple') },
      select: { examples: true },
    });
    expect(row?.examples).toEqual(edited);
  });

  it('ipa: by lemmaKey, by part of speech where it differs; unknown lexemes untouched; idempotent', async () => {
    await db.lexeme.updateMany({ where: { lemmaKey: k('chef') }, data: { ipa: 'ʃɛf' } });
    await db.lexeme.updateMany({ where: { lemmaKey: k('bake') }, data: { ipa: 'old' } });
    const data = {
      entries: { [k('apple')]: 'ˈæpəl', [k('bake')]: null },
      byPos: { [k('go')]: { VERB: 'ɡoʊ' } },
    };
    const ipa = async () =>
      (
        await db.lexeme.findMany({
          where: ours,
          select: { lemmaKey: true, pos: true, ipa: true },
          orderBy: [{ lemmaKey: 'asc' }, { pos: 'asc' }],
        })
      ).map((l) => [l.lemmaKey.slice(RUN.length + 1), l.pos, l.ipa]);

    expect(await syncIpa(db, data, { lemmaKeyPrefix: RUN, dryRun: true })).toMatchObject({
      lexemes: 8,
      inFile: 3,
      withIpa: 2,
      changed: 3,
      chunks: 0,
    });
    expect(await syncIpa(db, data, { lemmaKeyPrefix: RUN, chunkSize: 2 })).toMatchObject({
      changed: 3,
      chunks: 2,
    });
    expect(await ipa()).toEqual([
      ['apple', 'NOUN', 'ˈæpəl'],
      ['bake', 'VERB', null], // null in the file writes null
      ['bread', 'NOUN', null],
      ['chef', 'NOUN', 'ʃɛf'], // not in the file: untouched
      ['draft', 'NOUN', null],
      ['go', 'NOUN', null], // byPos has no NOUN: untouched
      ['go', 'VERB', 'ɡoʊ'],
      ['of', 'PREPOSITION', null],
    ]);
    expect(await syncIpa(db, data, { lemmaKeyPrefix: RUN })).toMatchObject({
      changed: 0,
      chunks: 0,
    });
  });
});
