import { describe, expect, it, vi } from 'vitest';
import { getBetaFeedbacks } from '../feedback';

type Db = Parameters<typeof getBetaFeedbacks>[0];

function mockDb() {
  const betaFeedback = { findMany: vi.fn().mockResolvedValue([]) };
  return { db: { betaFeedback } as unknown as Db, findMany: betaFeedback.findMany };
}

describe('getBetaFeedbacks', () => {
  it('newest first, with the author, and no metadata', async () => {
    const { db, findMany } = mockDb();
    await getBetaFeedbacks(db);
    const args = findMany.mock.calls[0]?.[0];
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(100);
    expect(args.select.user).toEqual({ select: { email: true, name: true } });
    expect(args.select).not.toHaveProperty('metadata');
    // Only what the list shows of the user: never the password hash or the role.
    expect(Object.keys(args.select.user.select)).toEqual(['email', 'name']);
  });

  it.each([
    [10, 10],
    [0, 1],
    [-5, 1],
    [2.7, 2],
    [10_000, 500],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
  ])('clamps limit %s to %s', async (limit, take) => {
    const { db, findMany } = mockDb();
    await getBetaFeedbacks(db, { limit });
    expect(findMany.mock.calls[0]?.[0].take).toBe(take);
  });
});
