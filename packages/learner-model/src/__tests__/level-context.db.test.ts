import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStaticGraphCache, createPrismaLearnerDb } from '../service/prisma-db';

/**
 * getLevelContext and getAttemptOutcomes on real Postgres: the assessed level
 * comes from StudentProfile (null without a profile or before the diagnostic)
 * and every concept carries its CEFR level; outcomes are the ITEM_ATTEMPTED
 * events after the latest bootstrap, oldest first. Same gate as the other DB
 * tests.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the level context DB test would be skipped');
}

const RUN = `test-start-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('getLevelContext / getAttemptOutcomes (real Postgres)', () => {
  let db: PrismaClient;
  const ids = { assessed: '', pending: '', noProfile: '' };

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({
      data: { id: `${RUN}.concept`, name: 'start', cefrLevel: 'B2', category: 'GRAMMAR' },
    });
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      const user = await db.user.create({ data: { email: `${RUN}-${key}@test.dev` } });
      ids[key] = user.id;
    }
    await db.studentProfile.create({ data: { userId: ids.assessed, assessedLevel: 'B1' } });
    await db.studentProfile.create({ data: { userId: ids.pending } });
  });

  // Rows are created per run: never read concept levels cached before them.
  beforeEach(() => clearStaticGraphCache());

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('reads the assessed level and the concept levels', async () => {
    const ctx = await createPrismaLearnerDb(db).getLevelContext(ids.assessed);
    expect(ctx.level).toBe('B1');
    expect(ctx.concepts).toContainEqual({ id: `${RUN}.concept`, cefrLevel: 'B2' });
  });

  it('null level before the diagnostic and without a profile', async () => {
    const learner = createPrismaLearnerDb(db);
    expect((await learner.getLevelContext(ids.pending)).level).toBeNull();
    expect((await learner.getLevelContext(ids.noProfile)).level).toBeNull();
  });

  it('outcomes: ITEM_ATTEMPTED after the latest bootstrap, by (occurredAt, id), hinted read', async () => {
    const userId = ids.noProfile;
    const attempt = (conceptId: string, correct: boolean, hinted?: true) => ({
      itemId: `${RUN}.item`,
      conceptId,
      correct,
      timeMs: null,
      rating: correct ? 'GOOD' : 'AGAIN',
      irt: { a: 1, b: 0 },
      ...(hinted ? { hinted } : {}),
    });
    const events: [bigint, 'ITEM_ATTEMPTED' | 'LEARNER_BOOTSTRAPPED', object][] = [
      [1n, 'ITEM_ATTEMPTED', attempt('before.first', true)],
      [2n, 'LEARNER_BOOTSTRAPPED', {}],
      [3n, 'ITEM_ATTEMPTED', attempt('before.second', false)],
      [4n, 'LEARNER_BOOTSTRAPPED', {}],
      // Inserted out of order: the read orders by occurredAt.
      [6n, 'ITEM_ATTEMPTED', attempt('after.second', true, true)],
      [5n, 'ITEM_ATTEMPTED', attempt('after.first', false)],
    ];
    for (const [occurredAt, type, payload] of events) {
      await db.learnerEvent.create({ data: { userId, type, occurredAt, payload } });
    }
    expect(await createPrismaLearnerDb(db).getAttemptOutcomes(userId)).toEqual([
      { conceptId: 'after.first', correct: false, hinted: false },
      { conceptId: 'after.second', correct: true, hinted: true },
    ]);
    // Without a bootstrap: every attempt.
    await db.learnerEvent.deleteMany({ where: { userId, type: 'LEARNER_BOOTSTRAPPED' } });
    expect(
      (await createPrismaLearnerDb(db).getAttemptOutcomes(userId)).map((o) => o.conceptId),
    ).toEqual(['before.first', 'before.second', 'after.first', 'after.second']);
  });
});
