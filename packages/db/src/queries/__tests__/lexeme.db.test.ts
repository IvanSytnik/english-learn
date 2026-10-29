import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { Prisma, PrismaClient } from '../../generated/client/client';
import { type CreateLexemeInput, CreateLexemeInputSchema } from '../../schemas/lexeme';

/**
 * Lexeme against a real, migrated Postgres: the unique key, the raw-SQL CHECKs
 * (migration 20261029180000_add_lexeme_model), the Item.lexemeId SetNull
 * foreign key and the StudentProfile.dailyVocabLimit default/range are
 * guarantees only the database can prove. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Every row carries this run's tag and is
 * deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the lexeme DB tests would be skipped');
}

const RUN = `test-lexeme-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const valid = (lemma: string, extra: Partial<CreateLexemeInput> = {}): CreateLexemeInput => ({
  lemma,
  pos: 'VERB',
  cefrLevel: 'A1',
  cefrJLevel: 'A1.2',
  definitions: { en: 'to move quickly on foot', ru: 'бежать' },
  translations: { ru: 'бежать', uk: 'бігти', de: 'laufen' },
  examples: [
    {
      sentence: 'She ran to the station.',
      translation: { ru: 'Она побежала на станцию.' },
      clozeTarget: 'ran',
    },
  ],
  collocations: ['run fast', 'run a business'],
  ...extra,
});

describe.skipIf(!url)('Lexeme (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  const create = (input: CreateLexemeInput) =>
    db.lexeme.create({ data: CreateLexemeInputSchema.parse(input) });

  /** Bypasses Zod: the CHECKs must hold against any writer. */
  const createRaw = (lemma: string, data: Partial<Prisma.LexemeCreateInput>) =>
    db.lexeme.create({ data: { ...CreateLexemeInputSchema.parse(valid(lemma)), ...data } });

  const newProfile = async (data: Prisma.StudentProfileCreateWithoutUserInput = {}) => {
    const user = await db.user.create({
      data: { email: `${RUN}-${userIds.length}@test.local`, profile: { create: data } },
      select: { id: true, profile: { select: { dailyVocabLimit: true } } },
    });
    userIds.push(user.id);
    return user.profile;
  };

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({ data: { id: RUN, name: RUN, cefrLevel: 'A1', category: 'VOCAB' } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await db.concept.deleteMany({ where: { id: RUN } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('stores a valid lexeme with its JSON payloads, DRAFT by default', async () => {
    const row = await create(valid(`${RUN}-run`));
    expect(row).toMatchObject({
      lemmaKey: `${RUN}-run`,
      sense: '',
      status: 'DRAFT',
      translations: { ru: 'бежать', uk: 'бігти', de: 'laufen' },
      collocations: ['run fast', 'run a business'],
    });
    expect(row.examples).toEqual([
      {
        sentence: 'She ran to the station.',
        translation: { ru: 'Она побежала на станцию.' },
        clozeTarget: 'ran',
      },
    ]);
  });

  it('defaults examples to [] and collocations to {}', async () => {
    const row = await db.lexeme.create({
      data: {
        lemma: `${RUN}-bare`,
        lemmaKey: `${RUN}-bare`,
        pos: 'NOUN',
        cefrLevel: 'A1',
        cefrJLevel: 'PreA1',
        definitions: { en: 'x' },
        translations: { ru: 'x' },
      },
    });
    expect(row).toMatchObject({ examples: [], collocations: [] });
  });

  it('rejects a duplicate [lemmaKey, pos, sense] whatever the case, padding or level (P2002)', async () => {
    await create(valid(`${RUN}-walk`));
    await expect(create(valid(`${RUN}-walk`))).rejects.toMatchObject({ code: 'P2002' });
    await expect(create(valid(` ${RUN.toUpperCase()}-Walk `))).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      create(valid(`${RUN}-walk`, { cefrLevel: 'A2', cefrJLevel: 'A2.1' })),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps homonyms apart by sense and part of speech', async () => {
    await create(valid(`${RUN}-bank`, { pos: 'NOUN', sense: 'finance' }));
    await expect(
      create(valid(`${RUN}-bank`, { pos: 'NOUN', sense: 'river' })),
    ).resolves.toBeTruthy();
    await expect(
      create(valid(`${RUN}-bank`, { pos: 'VERB', sense: 'finance' })),
    ).resolves.toBeTruthy();
  });

  it('rejects a lemmaKey that is not the normalized lemma (CHECK)', async () => {
    await expect(createRaw(`${RUN}-Swim`, { lemmaKey: `${RUN}-Swim` })).rejects.toThrow(
      /Lexeme_lemmaKey_normalized/,
    );
  });

  // The prefix matches cefrLevel in every case, so only the list CHECK can fail
  // (Postgres reports one violated CHECK per row).
  it.each([
    ['A1', 'A1.4'],
    ['A1', 'A1'],
    ['A1', 'A1.1 '],
    ['B2', 'B2.3'],
    ['C1', 'C1.1'],
  ] as const)('rejects cefrLevel %s with the CEFR-J level %j (CHECK)', async (cefrLevel, cefrJLevel) => {
    await expect(createRaw(`${RUN}-lvl-${cefrJLevel}`, { cefrLevel, cefrJLevel })).rejects.toThrow(
      /Lexeme_cefrJLevel_valid/,
    );
  });

  it.each([
    ['B1', 'A2.1'],
    ['A2', 'PreA1'],
    ['C2', 'C1'],
  ] as const)('rejects cefrLevel %s with cefrJLevel %s (CHECK)', async (cefrLevel, cefrJLevel) => {
    await expect(
      createRaw(`${RUN}-mismatch-${cefrLevel}-${cefrJLevel}`, { cefrLevel, cefrJLevel }),
    ).rejects.toThrow(/Lexeme_cefrJLevel_matches_cefrLevel/);
  });

  it('rejects examples that are not a JSON array (CHECK)', async () => {
    await expect(
      createRaw(`${RUN}-obj`, { examples: { sentence: 'x', clozeTarget: 'x' } }),
    ).rejects.toThrow(/Lexeme_examples_is_array/);
  });

  it('rejects NULL collocations (CHECK)', async () => {
    const row = await create(valid(`${RUN}-null`));
    await expect(
      db.$executeRaw`UPDATE "Lexeme" SET "collocations" = NULL WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/Lexeme_collocations_not_null/);
  });

  it('deleting a lexeme sets Item.lexemeId to NULL and keeps the item (SetNull)', async () => {
    const lexeme = await create(valid(`${RUN}-jump`));
    const item = await db.item.create({
      data: {
        conceptId: RUN,
        kind: 'VOCAB_WORD',
        cefrLevel: 'A1',
        content: { source: {} },
        lexemeId: lexeme.id,
      },
    });
    await db.lexeme.delete({ where: { id: lexeme.id } });
    await expect(db.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
      id: item.id,
      lexemeId: null,
    });
  });

  it('defaults StudentProfile.dailyVocabLimit to 10', async () => {
    await expect(newProfile()).resolves.toEqual({ dailyVocabLimit: 10 });
  });

  // Prisma sends @default values itself; only a raw INSERT exercises the column DEFAULT.
  it('defaults dailyVocabLimit to 10 in the database too', async () => {
    const user = await db.user.create({
      data: { email: `${RUN}-raw@test.local` },
      select: { id: true },
    });
    userIds.push(user.id);
    await db.$executeRaw`
      INSERT INTO "StudentProfile" ("id", "userId", "updatedAt")
      VALUES (${`${RUN}-raw`}, ${user.id}, now())`;
    await expect(
      db.studentProfile.findUnique({
        where: { userId: user.id },
        select: { dailyVocabLimit: true },
      }),
    ).resolves.toEqual({ dailyVocabLimit: 10 });
  });

  it.each([1, 50])('accepts dailyVocabLimit %i', async (dailyVocabLimit) => {
    await expect(newProfile({ dailyVocabLimit })).resolves.toEqual({ dailyVocabLimit });
  });

  it.each([0, 51, -1])('rejects dailyVocabLimit %i (CHECK)', async (dailyVocabLimit) => {
    await expect(newProfile({ dailyVocabLimit })).rejects.toThrow(
      /StudentProfile_dailyVocabLimit_range/,
    );
  });
});
