import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LearnerModelDb } from '../service/db-port';
import { createLearnerService } from '../service/learner-service';
import { createPrismaLearnerDb } from '../service/prisma-db';

/**
 * Idempotent recordOutcome on real Postgres: concurrent submissions of one
 * key record one outcome (the user lock), and a write that slips past the
 * lock is caught by the (userId, idempotencyKey) unique index and answered
 * from the winner. Same gate as the other DB tests (DIAG_DB_TEST_URL;
 * required in CI). Every row hangs off users and a concept this run creates.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the recordOutcome idempotency DB test would be skipped',
  );
}

const RUN = `test-idem-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.concept`;

/**
 * The real port without the user lock, with every key lookup held until
 * `parties` of them have run — so all concurrent writers see the key free
 * and race to the insert, which only the unique index can stop.
 */
function lockFreeRace(db: LearnerModelDb, parties: number): LearnerModelDb {
  let arrived = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    ...db,
    runInTx: (fn) =>
      db.runInTx((tx) =>
        fn({
          ...tx,
          lockUser: async () => {},
          findEventByIdempotencyKey: async (userId, key) => {
            const row = await tx.findEventByIdempotencyKey(userId, key);
            arrived += 1;
            if (arrived >= parties) release();
            await gate;
            return row;
          },
        }),
      ),
  };
}

describe.skipIf(!url)('recordOutcome idempotency (real Postgres)', () => {
  let prisma: PrismaClient;
  let itemA: string;
  let itemB: string;

  const newUser = async (tag: string) =>
    (await prisma.user.create({ data: { email: `${RUN}-${tag}@test.dev` } })).id;

  const stored = async (userId: string) => ({
    events: await prisma.learnerEvent.count({ where: { userId } }),
    mastery: await prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId: CONCEPT } },
      select: { observationCount: true },
    }),
    review: await prisma.itemReviewState.findUnique({
      where: { userId_itemId: { userId, itemId: itemA } },
      select: { reps: true },
    }),
  });

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    await prisma.concept.create({
      data: { id: CONCEPT, name: 'idempotency', cefrLevel: 'B1', category: 'GRAMMAR' },
    });
    const item = () =>
      prisma.item.create({
        data: {
          conceptId: CONCEPT,
          kind: 'GRAMMAR_PATTERN',
          cefrLevel: 'B1',
          status: 'PUBLISHED',
          content: { source: {}, practice: { type: 'choice' } },
          hasPractice: true,
        },
      });
    itemA = (await item()).id;
    itemB = (await item()).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.concept.deleteMany({ where: { id: CONCEPT } });
    await prisma.$disconnect();
  });

  it('five concurrent submissions of one key record one outcome', async () => {
    const userId = await newUser('concurrent');
    const service = createLearnerService(createPrismaLearnerDb(prisma));
    const key = crypto.randomUUID();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.recordOutcome({ userId, itemId: itemA, correct: true, idempotencyKey: key }),
      ),
    );

    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.duplicate)).toHaveLength(4);
    const occurredAt = new Set(results.map((r) => (r.ok ? r.occurredAt : null)));
    expect(occurredAt.size).toBe(1);
    expect(await stored(userId)).toEqual({
      events: 1,
      mastery: { observationCount: 1 },
      review: { reps: 1 },
    });
  });

  it('a write past the lock hits the unique index and gets the winner', async () => {
    const userId = await newUser('race');
    const service = createLearnerService(lockFreeRace(createPrismaLearnerDb(prisma), 2));
    const key = crypto.randomUUID();

    const results = await Promise.all([
      service.recordOutcome({ userId, itemId: itemA, correct: true, idempotencyKey: key }),
      service.recordOutcome({ userId, itemId: itemA, correct: false, idempotencyKey: key }),
    ]);

    const winner = results.find((r) => r.ok && !r.duplicate);
    const loser = results.find((r) => r.ok && r.duplicate);
    if (!winner?.ok || !loser?.ok || !loser.duplicate) throw new Error('expected one of each');
    expect(loser.occurredAt).toBe(winner.occurredAt);
    expect(loser.original.correct).toBe(winner.rating === 'GOOD');
    expect(await stored(userId)).toEqual({
      events: 1,
      mastery: { observationCount: 1 },
      review: { reps: 1 },
    });
  });

  it('the same key on another item is IDEMPOTENCY_CONFLICT', async () => {
    const userId = await newUser('conflict');
    const service = createLearnerService(createPrismaLearnerDb(prisma));
    const key = crypto.randomUUID();
    await service.recordOutcome({ userId, itemId: itemA, correct: true, idempotencyKey: key });

    const result = await service.recordOutcome({
      userId,
      itemId: itemB,
      correct: true,
      idempotencyKey: key,
    });

    expect(result).toEqual({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
    expect((await stored(userId)).events).toBe(1);
  });

  it('stores the key on the envelope, never in the payload', async () => {
    const userId = await newUser('envelope');
    const key = crypto.randomUUID();
    await createLearnerService(createPrismaLearnerDb(prisma)).recordOutcome({
      userId,
      itemId: itemA,
      correct: true,
      idempotencyKey: key,
    });

    const row = await prisma.learnerEvent.findFirstOrThrow({ where: { userId } });
    expect(row.idempotencyKey).toBe(key);
    expect(JSON.stringify(row.payload)).not.toContain(key);
  });
});
