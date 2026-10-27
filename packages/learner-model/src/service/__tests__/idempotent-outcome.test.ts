import { describe, expect, it } from 'vitest';
import { IdempotencyKeyTakenError, type ItemForOutcome, type LearnerModelDb } from '../db-port';
import { createLearnerService } from '../learner-service';
import { createMemoryDb } from './memory-db';

/**
 * recordOutcome with an idempotency key: a retried submission records
 * nothing and answers with the original outcome; the same key on another
 * item is a conflict; no key means no deduplication.
 */

const ITEMS: Record<string, ItemForOutcome> = {
  'item.a': { conceptId: 'concept.a', irtDiscrimination: 1, irtDifficulty: 0 },
  'item.b': { conceptId: 'concept.b', irtDiscrimination: 1, irtDifficulty: 0 },
};

const USER = 'user_1';
const KEY = '7d0c3f2e-1b4a-4c9e-8f6d-2a5b9c1e0f3a';
const T0 = 1_750_000_000_000n;
const DAY_MS = 86_400_000n;

/** Deep copies of both projections, to prove a duplicate changed nothing. */
function snapshot(mem: ReturnType<typeof createMemoryDb>) {
  return {
    masteries: structuredClone([...mem.masteries.entries()]),
    reviews: structuredClone([...mem.reviews.entries()]),
  };
}

describe('recordOutcome — idempotency key', () => {
  it('a retry with the same key writes nothing and returns the original outcome', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);

    const first = await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: false,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });
    const before = snapshot(mem);

    // The retry claims a different answer; the recorded one must win.
    const retry = await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      hinted: true,
      idempotencyKey: KEY,
    });

    expect(first).toMatchObject({ ok: true, duplicate: false, rating: 'AGAIN' });
    if (!first.ok) throw new Error('unreachable');
    expect(retry).toEqual({
      ok: true,
      duplicate: true,
      original: { correct: false, dontKnow: false, hinted: false },
      occurredAt: first.occurredAt,
      rating: 'AGAIN',
      conceptId: 'concept.a',
      pKnownBefore: first.pKnownAfter,
      pKnownAfter: first.pKnownAfter,
      nextDueAt: first.nextDueAt,
      scheduledDays: first.scheduledDays,
      cardStatus: first.cardStatus,
      stageBefore: first.stageAfter,
      stageAfter: first.stageAfter,
    });
    expect(mem.events).toHaveLength(1);
    expect(snapshot(mem)).toEqual(before);
  });

  it('freezes dontKnow and hinted of the original into `original`', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      dontKnow: true,
      hinted: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });

    const retry = await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      idempotencyKey: KEY,
    });

    expect(retry).toMatchObject({
      duplicate: true,
      original: { correct: false, dontKnow: true, hinted: true },
    });
  });

  it('reproduces a multi-day interval from the stored schedule', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);
    // Climb out of the learning steps so the keyed review is days long.
    for (let day = 0n; day < 4n; day += 1n) {
      await service.recordOutcome({
        userId: USER,
        itemId: 'item.a',
        correct: true,
        occurredAtMs: T0 + day * 3n * DAY_MS,
      });
    }
    const first = await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0 + 20n * DAY_MS,
      idempotencyKey: KEY,
    });
    const retry = await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      idempotencyKey: KEY,
    });

    if (!first.ok || !retry.ok) throw new Error('unreachable');
    expect(first.scheduledDays).toBeGreaterThan(1);
    expect(retry.scheduledDays).toBe(first.scheduledDays);
    expect(retry.nextDueAt).toBe(first.nextDueAt);
  });

  it('the same key on another item is IDEMPOTENCY_CONFLICT and writes nothing', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });
    const before = snapshot(mem);

    const result = await service.recordOutcome({
      userId: USER,
      itemId: 'item.b',
      correct: true,
      idempotencyKey: KEY,
    });

    expect(result).toEqual({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
    expect(mem.events).toHaveLength(1);
    expect(snapshot(mem)).toEqual(before);
  });

  it('keys are per user: another user records under the same key', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });

    const other = await service.recordOutcome({
      userId: 'user_2',
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });

    expect(other).toMatchObject({ ok: true, duplicate: false });
    expect(mem.events).toHaveLength(2);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
  ])('without a key (%s) every call is recorded and nothing is looked up', async (_, key) => {
    const mem = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(mem.db);
    for (const at of [T0, T0 + 1n]) {
      const result = await service.recordOutcome({
        userId: USER,
        itemId: 'item.a',
        correct: true,
        occurredAtMs: at,
        idempotencyKey: key,
      });
      expect(result).toMatchObject({ ok: true, duplicate: false });
    }
    expect(mem.events).toHaveLength(2);
    expect(mem.transactions.flat()).not.toContain('findEventByIdempotencyKey');
  });

  it('looks the key up under the lock, before anything else', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    await createLearnerService(mem.db).recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      idempotencyKey: KEY,
    });
    expect(mem.transactions[0]?.slice(0, 3)).toEqual([
      'lockUser',
      'findEventByIdempotencyKey',
      'lastEventOccurredAt',
    ]);
  });
});

describe('recordOutcome — unique-index backstop', () => {
  /**
   * A db whose first `misses` key lookups see nothing — a write that slipped
   * past the user lock, so the insert itself hits the taken key.
   */
  function staleLookups(db: LearnerModelDb, misses: number): LearnerModelDb {
    let left = misses;
    return {
      ...db,
      runInTx: (fn) =>
        db.runInTx((tx) =>
          fn({
            ...tx,
            findEventByIdempotencyKey: async (userId, key) => {
              if (left > 0) {
                left -= 1;
                return null;
              }
              return tx.findEventByIdempotencyKey(userId, key);
            },
          }),
        ),
    };
  }

  it('a taken key at insert is answered from the winner in a fresh transaction', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    const first = await createLearnerService(mem.db).recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });
    const before = snapshot(mem);

    const retry = await createLearnerService(staleLookups(mem.db, 1)).recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: false,
      idempotencyKey: KEY,
    });

    if (!first.ok) throw new Error('unreachable');
    expect(retry).toMatchObject({
      ok: true,
      duplicate: true,
      occurredAt: first.occurredAt,
      original: { correct: true },
    });
    expect(mem.events).toHaveLength(1);
    expect(snapshot(mem)).toEqual(before);
    // Second transaction: lock, then the lookup — nothing written.
    expect(mem.transactions.at(-1)).toEqual([
      'lockUser',
      'findEventByIdempotencyKey',
      'getConceptMastery',
      'getItemReviewState',
    ]);
  });

  it('rethrows the taken-key error if the winner cannot be found either', async () => {
    const mem = createMemoryDb({ items: ITEMS });
    await createLearnerService(mem.db).recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T0,
      idempotencyKey: KEY,
    });

    await expect(
      createLearnerService(staleLookups(mem.db, 2)).recordOutcome({
        userId: USER,
        itemId: 'item.a',
        correct: true,
        idempotencyKey: KEY,
      }),
    ).rejects.toBeInstanceOf(IdempotencyKeyTakenError);
  });
});
