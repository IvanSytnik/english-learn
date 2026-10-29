import type { PrismaClient } from '@englishlearn/db';
import { createPrismaClient } from '@englishlearn/db/create-client';
import {
  applyLexemeLocalizations,
  findLexemesToLocalize,
} from '@englishlearn/db/queries/lexeme-localization';
import { CreateDraftLexemeInputSchema } from '@englishlearn/db/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LocalizationCaller } from '../client';
import { runLocalization } from '../runner';
import type { LocalizationRequestItem } from '../types';

/**
 * The whole localization flow against a real, migrated Postgres with a mocked
 * model: DRAFT → REVIEW for valid answers, rejected words left DRAFT, and a
 * second run that finds nothing left to do. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI); rows carry this run's tag.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the localization DB tests would be skipped');
}

const RUN = `test-loc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WORDS = ['bake', 'cook', 'fry', 'grill', 'roast'] as const;

/** Valid answers, except for `fry`, whose Ukrainian gloss is Russian. */
const model: LocalizationCaller = async (items: readonly LocalizationRequestItem[]) => ({
  data: {
    items: items.map((item) => {
      const word = item.lemma.slice(RUN.length + 1);
      return {
        key: item.key,
        lemma: item.lemma,
        definitionEn: 'to make food ready to eat with heat',
        translations: {
          ru: 'готовить',
          uk: word === 'fry' ? 'жарить съедобное' : 'готувати',
          de: 'kochen',
        },
        examples: [
          {
            sentence: `We ${item.lemma} dinner.`,
            clozeTarget: item.lemma,
            translation: {
              ru: 'Мы готовим ужин.',
              uk: 'Ми готуємо вечерю.',
              de: 'Wir kochen Abendessen.',
            },
          },
        ],
        collocations: [],
      };
    }),
  },
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

describe.skipIf(!url)('localization run (real Postgres, mocked model)', () => {
  let db: PrismaClient;
  const ours = { lemmaKey: { startsWith: RUN } };
  const run = (call: LocalizationCaller = model) =>
    runLocalization({
      store: {
        findPending: async () =>
          (await findLexemesToLocalize(db)).filter((l) => l.lemmaKey.startsWith(RUN)),
        apply: (rows) => applyLexemeLocalizations(db, rows),
      },
      call,
      topicOf: () => 'food_drink',
      batchSize: 2,
      concurrency: 2,
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    for (const word of WORDS) {
      await db.lexeme.create({
        data: CreateDraftLexemeInputSchema.parse({
          lemma: `${RUN}-${word}`,
          pos: 'VERB',
          cefrLevel: 'A2',
          cefrJLevel: 'A2',
          definitions: {},
          translations: {},
        }),
      });
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.lexeme.deleteMany({ where: ours });
    await db.$disconnect();
  });

  it('moves the valid lexemes to REVIEW with their gloss and leaves the rejected one DRAFT', async () => {
    const report = await run();
    expect(report).toMatchObject({ pending: 5, chunks: 3, written: 4, rejected: 1 });

    const rows = await db.lexeme.findMany({ where: ours, orderBy: { lemmaKey: 'asc' } });
    expect(rows.map((r) => [r.lemma.slice(RUN.length + 1), r.status])).toEqual([
      ['bake', 'REVIEW'],
      ['cook', 'REVIEW'],
      ['fry', 'DRAFT'],
      ['grill', 'REVIEW'],
      ['roast', 'REVIEW'],
    ]);
    const bake = rows[0];
    expect(bake).toMatchObject({
      definitions: { en: 'to make food ready to eat with heat' },
      translations: { ru: 'готовить', uk: 'готувати', de: 'kochen' },
      examples: [{ sentence: `We ${RUN}-bake dinner.`, clozeTarget: `${RUN}-bake` }],
      collocations: [],
    });
    expect(rows.some((r) => r.status === 'PUBLISHED')).toBe(false);
    expect(rows.find((r) => r.status === 'DRAFT')?.translations).toEqual({});
  });

  it('resumes: the next run picks only the rejected lexeme, then nothing', async () => {
    const call = vi.fn(model);
    expect(await run(call)).toMatchObject({ pending: 1, written: 0, rejected: 1 });
    expect(call.mock.calls.flat(2).map((i) => i.lemma)).toEqual([`${RUN}-fry`]);

    const fixed: LocalizationCaller = async (items) => {
      const result = await model(items);
      const data = result.data as { items: { translations: { uk: string } }[] };
      for (const item of data.items) item.translations.uk = 'смажити';
      return result;
    };
    expect(await run(fixed)).toMatchObject({ pending: 1, written: 1, rejected: 0 });
    expect(await run()).toMatchObject({ pending: 0, chunks: 0, written: 0 });
  });
});
