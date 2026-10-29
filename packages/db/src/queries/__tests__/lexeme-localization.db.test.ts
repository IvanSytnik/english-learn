import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { CreateDraftLexemeInputSchema } from '../../schemas/lexeme';
import {
  applyLexemeLocalizations,
  findLexemesToLocalize,
  type LexemeLocalization,
} from '../lexeme-localization';

/**
 * The localization checkpoint and the DRAFT → REVIEW write against a real
 * Postgres (the JSON `{}` filter and the status-guarded update are what only
 * the database can prove). Same gate as the other DB tests; rows carry this
 * run's tag and are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the lexeme localization DB tests would be skipped',
  );
}

const RUN = `test-l10n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const localization = (id: string): LexemeLocalization => ({
  id,
  definitions: { en: 'a round fruit' },
  translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
  examples: [
    {
      sentence: 'I eat an apple.',
      clozeTarget: 'apple',
      translation: { ru: 'Я ем яблоко.', uk: 'Я їм яблуко.', de: 'Ich esse einen Apfel.' },
    },
  ],
  collocations: ['apple pie'],
});

describe.skipIf(!url)('lexeme localization (real Postgres)', () => {
  let db: PrismaClient;
  const ids: Record<string, string> = {};
  const ours = async () =>
    (await findLexemesToLocalize(db)).filter((l) => l.lemmaKey.startsWith(RUN));

  beforeAll(async () => {
    db = createPrismaClient(url);
    for (const [name, level] of [
      ['a', 'A1'],
      ['b', 'A2'],
      ['c', 'B1'],
    ] as const) {
      const row = await db.lexeme.create({
        data: CreateDraftLexemeInputSchema.parse({
          lemma: `${RUN}-${name}`,
          pos: 'NOUN',
          cefrLevel: level,
          cefrJLevel: level,
          definitions: {},
          translations: {},
        }),
      });
      ids[name] = row.id;
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('finds DRAFT lexemes with empty translations, optionally by level', async () => {
    expect((await ours()).map((l) => l.lemma)).toEqual([`${RUN}-a`, `${RUN}-b`, `${RUN}-c`]);
    const a2 = (await findLexemesToLocalize(db, { level: 'A2' })).filter((l) =>
      l.lemmaKey.startsWith(RUN),
    );
    expect(a2.map((l) => l.lemma)).toEqual([`${RUN}-b`]);
  });

  it('writes the gloss and moves the row to REVIEW, never PUBLISHED', async () => {
    expect(await applyLexemeLocalizations(db, [localization(ids.a as string)])).toBe(1);
    expect(await db.lexeme.findUnique({ where: { id: ids.a } })).toMatchObject({
      status: 'REVIEW',
      definitions: { en: 'a round fruit' },
      translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
      collocations: ['apple pie'],
    });
    expect((await ours()).map((l) => l.lemma)).toEqual([`${RUN}-b`, `${RUN}-c`]);
  });

  it('leaves a row that is no longer DRAFT alone', async () => {
    await db.lexeme.update({ where: { id: ids.b }, data: { status: 'REJECTED' } });
    expect(await applyLexemeLocalizations(db, [localization(ids.b as string)])).toBe(0);
    expect(await db.lexeme.findUnique({ where: { id: ids.b } })).toMatchObject({
      status: 'REJECTED',
      translations: {},
    });
  });

  it('rejects a localization whose example breaks the cloze rule, writing nothing', async () => {
    const bad = { ...localization(ids.c as string) };
    bad.examples = [
      { ...bad.examples[0], clozeTarget: 'pple' } as LexemeLocalization['examples'][0],
    ];
    await expect(applyLexemeLocalizations(db, [bad])).rejects.toThrow(/clozeTarget/);
    expect(await db.lexeme.findUnique({ where: { id: ids.c } })).toMatchObject({ status: 'DRAFT' });
  });
});
