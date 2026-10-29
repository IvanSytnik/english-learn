import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { CreateDraftLexemeInputSchema } from '../../schemas/lexeme';
import { type LocalizationSnapshotEntry, syncLocalizationSnapshot } from '../localization-snapshot';

/**
 * Applying the committed snapshot to a freshly imported database: matched by
 * unique key, DRAFT → REVIEW, never over a row that moved on, idempotent.
 * Rows carry this run's tag and are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the localization snapshot DB tests would be skipped',
  );
}

const RUN = `test-snap-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const entry = (name: string, cefrLevel: 'A1' | 'A2' = 'A1'): LocalizationSnapshotEntry => ({
  lemmaKey: `${RUN}-${name}`,
  pos: 'NOUN',
  sense: '',
  cefrLevel,
  definitions: { en: 'a round fruit' },
  translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
  examples: [
    {
      sentence: `I eat the ${RUN}-${name} now.`,
      clozeTarget: `${RUN}-${name}`,
      translation: { ru: 'Я ем яблоко.', uk: 'Я їм яблуко.', de: 'Ich esse den Apfel.' },
    },
  ],
  collocations: [],
});

describe.skipIf(!url)('localization snapshot sync (real Postgres)', () => {
  let db: PrismaClient;
  const ours = async () =>
    db.lexeme.findMany({
      where: { lemmaKey: { startsWith: RUN } },
      select: { lemma: true, status: true, translations: true },
      orderBy: { lemmaKey: 'asc' },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    for (const name of ['a', 'b', 'c', 'd']) {
      await db.lexeme.create({
        data: CreateDraftLexemeInputSchema.parse({
          lemma: `${RUN}-${name}`,
          pos: 'NOUN',
          cefrLevel: 'A1',
          cefrJLevel: 'A1',
          definitions: {},
          translations: {},
        }),
      });
    }
    await db.lexeme.updateMany({ where: { lemmaKey: `${RUN}-d` }, data: { status: 'REJECTED' } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('writes matched rows to REVIEW, skips a level mismatch, a missing entry and a non-DRAFT row', async () => {
    const entries = [entry('a'), entry('b', 'A2'), entry('d')];
    const report = await syncLocalizationSnapshot(db, entries);
    expect(report).toMatchObject({ matched: 1, written: 1, levelMismatch: 1 });
    expect(await ours()).toEqual([
      { lemma: `${RUN}-a`, status: 'REVIEW', translations: entry('a').translations },
      { lemma: `${RUN}-b`, status: 'DRAFT', translations: {} },
      { lemma: `${RUN}-c`, status: 'DRAFT', translations: {} },
      { lemma: `${RUN}-d`, status: 'REJECTED', translations: {} },
    ]);
  });

  it('is idempotent and a dry run writes nothing', async () => {
    const entries = [entry('a'), entry('c')];
    const dry = await syncLocalizationSnapshot(db, entries, { dryRun: true });
    expect(dry).toMatchObject({ matched: 1, written: 0 });
    expect((await ours())[2]).toMatchObject({ status: 'DRAFT' });
    expect(await syncLocalizationSnapshot(db, entries)).toMatchObject({ matched: 1, written: 1 });
    expect(await syncLocalizationSnapshot(db, entries)).toMatchObject({ matched: 0, written: 0 });
  });
});
