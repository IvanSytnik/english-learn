import { describe, expect, it, vi } from 'vitest';

import { getAttemptEvents, hasLearnerBootstrapped } from '../learner-activity';

type Db = Parameters<typeof getAttemptEvents>[0];
const dbWith = (rows: unknown[]) => {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { db: { learnerEvent: { findMany } } as unknown as Db, findMany };
};

describe('getAttemptEvents', () => {
  it('reads only this learner’s answers inside the window', async () => {
    const { db, findMany } = dbWith([]);
    await getAttemptEvents(db, { userId: 'u1', fromMs: 1000, toMs: 2000 });
    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      userId: 'u1',
      type: 'ITEM_ATTEMPTED',
      occurredAt: { gte: 1000n, lte: 2000n },
    });
    expect(findMany.mock.calls[0]?.[0].select).toEqual({ occurredAt: true });
  });

  it('returns plain-number timestamps', async () => {
    const { db } = dbWith([{ occurredAt: 1761170400000n }]);
    expect(await getAttemptEvents(db, { userId: 'u1', fromMs: 0, toMs: 1 })).toEqual([
      { type: 'ITEM_ATTEMPTED', occurredAt: 1761170400000 },
    ]);
  });
});

describe('hasLearnerBootstrapped', () => {
  type Db = Parameters<typeof hasLearnerBootstrapped>[0];
  const dbWith = (row: unknown) => {
    const findFirst = vi.fn().mockResolvedValue(row);
    return { db: { learnerEvent: { findFirst } } as unknown as Db, findFirst };
  };

  it('looks for this learner’s LEARNER_BOOTSTRAPPED event', async () => {
    const { db, findFirst } = dbWith(null);
    expect(await hasLearnerBootstrapped(db, 'u1')).toBe(false);
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      userId: 'u1',
      type: 'LEARNER_BOOTSTRAPPED',
    });
  });

  it('is true once the event exists', async () => {
    expect(await hasLearnerBootstrapped(dbWith({ id: 'e1' }).db, 'u1')).toBe(true);
  });
});
