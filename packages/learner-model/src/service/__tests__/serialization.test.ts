import { describe, expect, it } from 'vitest';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../../diagnostic';
import { createBootstrapService } from '../bootstrap-service';
import type { ItemForOutcome } from '../db-port';
import { createLearnerService } from '../learner-service';
import { OccurredAtNotMonotonicError } from '../occurred-at';
import { createPrismaLearnerDb } from '../prisma-db';
import { replayUser } from '../replay';
import { createMemoryDb } from './memory-db';

/**
 * Per-user write serialization. Real concurrency is not reproducible in a unit
 * test, so this pins the two properties the guarantee rests on:
 *   1. every write transaction takes the user lock FIRST — before any read
 *      that the write depends on;
 *   2. occurredAt is chosen under the lock and strictly increases per user,
 *      even when the clock returns the same millisecond (or steps back).
 */

const USER = 'u1';
const T = 1_750_000_000_000n;
const ITEMS: Record<string, ItemForOutcome> = {
  'item.a': { conceptId: 'grammar.a', irtDiscrimination: 1, irtDifficulty: 0 },
  'item.b': { conceptId: 'grammar.b', irtDiscrimination: 1, irtDifficulty: 0 },
};
const CONCEPTS: BootstrapConcept[] = [{ id: 'grammar.a', category: 'GRAMMAR', cefrLevel: 'A2' }];
const ANSWERS: DiagnosticAnswerFact[] = Array.from({ length: 3 }, () => ({
  axis: 'GRAMMAR' as const,
  correct: true,
}));

const bootstrapInput = (occurredAtMs?: bigint) => ({
  userId: USER,
  diagnosticAttemptId: 'da1',
  assessedLevel: 'B1' as const,
  answers: ANSWERS,
  concepts: CONCEPTS,
  ...(occurredAtMs === undefined ? {} : { occurredAtMs }),
});

describe('user lock comes first in every write transaction', () => {
  it('recordOutcome', async () => {
    const { db, transactions } = createMemoryDb({ items: ITEMS });
    await createLearnerService(db).recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.[0]).toBe('lockUser');
    expect(transactions[0]?.slice(1, 3)).toEqual(['lastEventOccurredAt', 'appendEvent']);
  });

  it('bootstrap — the strictly-once guard runs under the lock', async () => {
    const { db, transactions } = createMemoryDb();
    await createBootstrapService(db).bootstrapFromDiagnostic(bootstrapInput());
    expect(transactions[0]?.slice(0, 3)).toEqual([
      'lockUser',
      'hasEventOfType',
      'lastEventOccurredAt',
    ]);
  });

  it('replay', async () => {
    const { db, transactions } = createMemoryDb({ items: ITEMS });
    await createLearnerService(db).recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    await replayUser(db, USER);
    expect(transactions[1]?.slice(0, 2)).toEqual(['lockUser', 'deleteSnapshots']);
  });
});

describe('occurredAt is strictly increasing per user', () => {
  it('writes in the same millisecond get last + 1 ms, across both write paths', async () => {
    const { db, events, masteries } = createMemoryDb({ items: ITEMS });
    const clock = () => T;
    const learner = createLearnerService(db, { clock });

    const r1 = await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    const r2 = await learner.recordOutcome({ userId: USER, itemId: 'item.b', correct: false });
    const r3 = await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    const boot = await createBootstrapService(db, { clock }).bootstrapFromDiagnostic(
      bootstrapInput(),
    );

    expect([r1, r2, r3].map((r) => r.ok && r.occurredAt)).toEqual([T, T + 1n, T + 2n]);
    expect(boot.ok && boot.occurredAt).toBe(T + 3n);
    expect(events.map((e) => e.occurredAt)).toEqual([T, T + 1n, T + 2n, T + 3n]);
    // The projection is anchored to the same stamped moment.
    expect(masteries.get(`${USER}:grammar.b`)?.lastUpdatedAt).toBe(T + 1n);
  });

  it('a clock that steps back still yields a later timestamp', async () => {
    const { db } = createMemoryDb({ items: ITEMS });
    const times = [T, T - 5_000n];
    const learner = createLearnerService(db, { clock: () => times.shift() ?? T });

    await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    const second = await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    expect(second.ok && second.occurredAt).toBe(T + 1n);
  });

  it('another user is not affected by this user’s latest event', async () => {
    const { db } = createMemoryDb({ items: ITEMS });
    const learner = createLearnerService(db, { clock: () => T });
    await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    const other = await learner.recordOutcome({ userId: 'u2', itemId: 'item.a', correct: true });
    expect(other.ok && other.occurredAt).toBe(T);
  });

  it('replay of same-millisecond writes reproduces the live projections', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const learner = createLearnerService(db, { clock: () => T });
    for (const correct of [true, false, true, true]) {
      await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct });
    }
    const liveMastery = structuredClone([...masteries]);
    const liveReviews = structuredClone([...reviews]);

    await replayUser(db, USER);
    expect([...masteries]).toEqual(liveMastery);
    expect([...reviews]).toEqual(liveReviews);
  });
});

describe('explicit occurredAtMs (tests, backfills)', () => {
  it('is kept exactly when it is after the latest event', async () => {
    const { db } = createMemoryDb({ items: ITEMS });
    const learner = createLearnerService(db, { clock: () => T });
    await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true });
    const r = await learner.recordOutcome({
      userId: USER,
      itemId: 'item.a',
      correct: true,
      occurredAtMs: T + 10n,
    });
    expect(r.ok && r.occurredAt).toBe(T + 10n);
  });

  it('is rejected, writing nothing, when it is not after the latest event', async () => {
    const { db, events, masteries } = createMemoryDb({ items: ITEMS });
    const learner = createLearnerService(db);
    await learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true, occurredAtMs: T });
    const before = structuredClone([...masteries]);

    await expect(
      learner.recordOutcome({ userId: USER, itemId: 'item.a', correct: true, occurredAtMs: T }),
    ).rejects.toBeInstanceOf(OccurredAtNotMonotonicError);
    await expect(
      createBootstrapService(db).bootstrapFromDiagnostic(bootstrapInput(T - 1n)),
    ).rejects.toBeInstanceOf(OccurredAtNotMonotonicError);

    expect(events).toHaveLength(1);
    expect([...masteries]).toEqual(before);
  });
});

describe('bootstrap guard: one LEARNER_BOOTSTRAPPED per user', () => {
  it('practice before the diagnostic no longer blocks bootstrap; a second one is rejected', async () => {
    const { db, events } = createMemoryDb({ items: ITEMS });
    const clock = () => T;
    await createLearnerService(db, { clock }).recordOutcome({
      userId: USER,
      itemId: 'item.b',
      correct: true,
    });

    const boot = createBootstrapService(db, { clock });
    expect((await boot.bootstrapFromDiagnostic(bootstrapInput())).ok).toBe(true);
    expect(await boot.bootstrapFromDiagnostic(bootstrapInput())).toEqual({
      ok: false,
      error: 'ALREADY_BOOTSTRAPPED',
    });
    expect(events.map((e) => e.type)).toEqual(['ITEM_ATTEMPTED', 'LEARNER_BOOTSTRAPPED']);
  });
});

describe('Prisma port', () => {
  it('lockUser takes a transaction-scoped advisory lock keyed by the user id', async () => {
    const sql: { text: string; values: unknown[] }[] = [];
    const tx = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        sql.push({ text: strings.join('$'), values });
        return 1;
      },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const db = createPrismaLearnerDb(
      prisma as unknown as Parameters<typeof createPrismaLearnerDb>[0],
    );

    await db.runInTx((t) => t.lockUser(USER));
    expect(sql).toEqual([
      { text: 'SELECT pg_advisory_xact_lock(hashtextextended($, 0))', values: [USER] },
    ]);
  });
});
