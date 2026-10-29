import { describe, expect, it } from 'vitest';
import { createLearnerService } from '../learner-service';
import { createPrismaLearnerDb } from '../prisma-db';

/**
 * The Prisma port's outcome pools. Grammar (V3): recordOutcome gets only
 * practisable items (PUBLISHED with hasPractice). Vocab (B2.5):
 * recordVocabOutcome gets only PUBLISHED question-less VOCAB_WORD items on a
 * PUBLISHED lexeme. Anything else — including an item of the other pool — is
 * ITEM_NOT_FOUND before a transaction opens, so no LearnerEvent can be
 * written. A fake Prisma client serves the item row and counts transactions.
 */

type ItemRow = {
  conceptId: string;
  irtDiscrimination: number;
  irtDifficulty: number;
  status: string;
  hasPractice: boolean;
  kind: string;
  lexemeId: string | null;
  lexeme: { status: string } | null;
};

const PRACTISABLE: ItemRow = {
  conceptId: 'c1',
  irtDiscrimination: 1,
  irtDifficulty: 0,
  status: 'PUBLISHED',
  hasPractice: true,
  kind: 'GRAMMAR_PATTERN',
  lexemeId: null,
  lexeme: null,
};

const VOCAB: ItemRow = {
  ...PRACTISABLE,
  conceptId: 'vocab.food_drink.a1',
  hasPractice: false,
  kind: 'VOCAB_WORD',
  lexemeId: 'lx1',
  lexeme: { status: 'PUBLISHED' },
};

const IRT = { irtDiscrimination: 1, irtDifficulty: 0 };

function fakePrisma(row: ItemRow | null) {
  const calls = { transactions: 0 };
  const prisma = {
    item: { findUnique: async () => row },
    $transaction: async () => {
      calls.transactions++;
      throw new Error('fake prisma: transaction opened');
    },
  };
  const db = createPrismaLearnerDb(
    prisma as unknown as Parameters<typeof createPrismaLearnerDb>[0],
  );
  return { db, calls };
}

describe('getItemForOutcome gate — grammar pool (V3)', () => {
  it('returns the IRT metadata of a practisable item', async () => {
    const { db } = fakePrisma(PRACTISABLE);
    expect(await db.getItemForOutcome('i1', 'grammar')).toEqual({ conceptId: 'c1', ...IRT });
  });

  it.each<[string, ItemRow | null]>([
    ['a missing item', null],
    ['a DRAFT item', { ...PRACTISABLE, status: 'DRAFT' }],
    ['an ARCHIVED item', { ...PRACTISABLE, status: 'ARCHIVED' }],
    ['a PUBLISHED item without practice', { ...PRACTISABLE, hasPractice: false }],
    ['a vocabulary item', VOCAB],
  ])('rejects %s without opening a transaction', async (_, row) => {
    const { db, calls } = fakePrisma(row);
    expect(await db.getItemForOutcome('i1', 'grammar')).toBeNull();

    const result = await createLearnerService(db).recordOutcome({
      userId: 'u1',
      itemId: 'i1',
      correct: true,
    });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(calls.transactions).toBe(0);
  });
});

describe('getItemForOutcome gate — vocab pool (B2.5)', () => {
  it('returns the IRT metadata of a published lexeme-backed item', async () => {
    const { db } = fakePrisma(VOCAB);
    expect(await db.getItemForOutcome('i1', 'vocab')).toEqual({
      conceptId: 'vocab.food_drink.a1',
      ...IRT,
    });
  });

  it.each<[string, ItemRow | null]>([
    ['a missing item', null],
    ['a DRAFT item', { ...VOCAB, status: 'DRAFT' }],
    ['an ARCHIVED item', { ...VOCAB, status: 'ARCHIVED' }],
    ['an item of another kind', { ...VOCAB, kind: 'COLLOCATION' }],
    ['an item without a lexeme', { ...VOCAB, lexemeId: null, lexeme: null }],
    ['an item with a practice question', { ...VOCAB, hasPractice: true }],
    ['an item on a REVIEW lexeme', { ...VOCAB, lexeme: { status: 'REVIEW' } }],
    ['an item on an ARCHIVED lexeme', { ...VOCAB, lexeme: { status: 'ARCHIVED' } }],
    ['a grammar item', PRACTISABLE],
  ])('rejects %s without opening a transaction', async (_, row) => {
    const { db, calls } = fakePrisma(row);
    expect(await db.getItemForOutcome('i1', 'vocab')).toBeNull();

    const result = await createLearnerService(db).recordVocabOutcome({
      userId: 'u1',
      itemId: 'i1',
      correct: true,
      mode: 'recognition',
    });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(calls.transactions).toBe(0);
  });
});
