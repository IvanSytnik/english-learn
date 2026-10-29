import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';

/**
 * Vocabulary item invariants (migration 20261029220000_vocab_item_invariants)
 * against a real, migrated Postgres: one VOCAB_WORD item per lexeme (the
 * partial unique index vocab:publish relies on for idempotency) and pool
 * isolation — a lexeme-backed item never has a practice question, so grammar
 * selection can never serve it (CHECK Item_lexeme_not_practisable). Same gate
 * as the other DB tests (DIAG_DB_TEST_URL; required in CI).
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the vocab item invariants DB test would be skipped',
  );
}

const RUN = `test-vocabitem-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const INDEX = 'Item_vocab_lexemeId_key';
const practice = { type: 'choice', prompt: 'I ___ here.', options: ['am', 'is'], correctIndex: 0 };

describe.skipIf(!url)('vocabulary Item invariants (real Postgres)', () => {
  let db: PrismaClient;
  let lexemeId: string;
  let otherLexemeId: string;

  const item = (data: {
    lexemeId?: string | null;
    kind?: 'VOCAB_WORD' | 'COLLOCATION';
    practise?: boolean;
  }) =>
    db.item.create({
      data: {
        conceptId: RUN,
        kind: data.kind ?? 'VOCAB_WORD',
        cefrLevel: 'A1',
        status: 'PUBLISHED',
        lexemeId: data.lexemeId ?? null,
        content: data.practise ? { source: {}, practice } : { source: {} },
        hasPractice: data.practise === true,
      },
    });

  const lexeme = (lemma: string) =>
    db.lexeme.create({
      data: {
        lemma,
        lemmaKey: lemma,
        pos: 'VERB',
        cefrLevel: 'A1',
        cefrJLevel: 'A1',
        definitions: { en: 'x' },
        translations: { ru: 'x' },
      },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({ data: { id: RUN, name: RUN, cefrLevel: 'A1', category: 'VOCAB' } });
    lexemeId = (await lexeme(`${RUN}-run`)).id;
    otherLexemeId = (await lexeme(`${RUN}-walk`)).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.concept.deleteMany({ where: { id: RUN } });
    await db.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('accepts one question-less VOCAB_WORD item per lexeme', async () => {
    await expect(item({ lexemeId })).resolves.toMatchObject({ lexemeId, hasPractice: false });
  });

  it('rejects a second VOCAB_WORD item for the same lexeme (partial unique)', async () => {
    await expect(item({ lexemeId })).rejects.toThrow(/Unique constraint/);
  });

  it('lets another kind reference the same lexeme', async () => {
    await expect(item({ lexemeId, kind: 'COLLOCATION' })).resolves.toMatchObject({ lexemeId });
    await expect(item({ lexemeId, kind: 'COLLOCATION' })).resolves.toMatchObject({ lexemeId });
  });

  it('never collides on items without a lexeme', async () => {
    await item({});
    await expect(item({})).resolves.toMatchObject({ lexemeId: null });
  });

  it('rejects a lexeme-backed item with a practice question (CHECK)', async () => {
    await expect(item({ lexemeId: otherLexemeId, practise: true })).rejects.toThrow(
      /Item_lexeme_not_practisable/,
    );
  });

  it('rejects giving an existing vocab item a practice question (CHECK)', async () => {
    const row = await db.item.findFirstOrThrow({ where: { lexemeId, kind: 'VOCAB_WORD' } });
    await expect(
      db.item.update({
        where: { id: row.id },
        data: { content: { source: {}, practice }, hasPractice: true },
      }),
    ).rejects.toThrow(/Item_lexeme_not_practisable/);
  });

  it('still lets a lexeme-less item carry a practice question', async () => {
    await expect(item({ practise: true })).resolves.toMatchObject({ hasPractice: true });
  });

  it('has the partial unique index on VOCAB_WORD lexemes', async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Item' AND indexname = ${INDEX}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/UNIQUE INDEX .* \("lexemeId"\) WHERE/);
    expect(rows[0]?.indexdef).toContain("'VOCAB_WORD'");
  });
});
