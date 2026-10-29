import { describe, expect, it } from 'vitest';
import { createLearnerService } from '../learner-service';
import { createPrismaLearnerDb } from '../prisma-db';

/**
 * V3: the Prisma port hands recordOutcome only practisable items (PUBLISHED
 * with hasPractice). Anything else is ITEM_NOT_FOUND before a transaction
 * opens, so no LearnerEvent can be written. A fake Prisma client serves the
 * item row and counts transactions.
 */

type ItemRow = {
  conceptId: string;
  irtDiscrimination: number;
  irtDifficulty: number;
  status: string;
  hasPractice: boolean;
};

const PRACTISABLE: ItemRow = {
  conceptId: 'c1',
  irtDiscrimination: 1,
  irtDifficulty: 0,
  status: 'PUBLISHED',
  hasPractice: true,
};

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

describe('getItemForOutcome gate (V3)', () => {
  it('returns the IRT metadata of a practisable item', async () => {
    const { db } = fakePrisma(PRACTISABLE);
    expect(await db.getItemForOutcome('i1')).toEqual({
      conceptId: 'c1',
      irtDiscrimination: 1,
      irtDifficulty: 0,
    });
  });

  it.each<[string, ItemRow | null]>([
    ['a missing item', null],
    ['a DRAFT item', { ...PRACTISABLE, status: 'DRAFT' }],
    ['an ARCHIVED item', { ...PRACTISABLE, status: 'ARCHIVED' }],
    ['a PUBLISHED item without practice', { ...PRACTISABLE, hasPractice: false }],
  ])('rejects %s without opening a transaction', async (_, row) => {
    const { db, calls } = fakePrisma(row);
    expect(await db.getItemForOutcome('i1')).toBeNull();

    const result = await createLearnerService(db).recordOutcome({
      userId: 'u1',
      itemId: 'i1',
      correct: true,
    });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(calls.transactions).toBe(0);
  });
});
