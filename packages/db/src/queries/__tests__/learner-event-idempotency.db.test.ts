import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';

/**
 * LearnerEvent.@@unique([userId, idempotencyKey]) against a real, migrated
 * Postgres: the guarantee lives in the index (and in NULLs being distinct in
 * it), so a mock could not prove it. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Every row hangs off users this run
 * creates and deletes.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the learner event idempotency DB test would be skipped',
  );
}

const RUN = `test-idem-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const KEY = '0b7e7f8e-6f0a-4c1e-9d55-6a1f3c2b9e10';
const T0 = 1_790_000_000_000n;

describe.skipIf(!url)('LearnerEvent idempotency key (real Postgres)', () => {
  let db: PrismaClient;
  let learner: string;
  let other: string;

  const event = (userId: string, occurredAt: bigint, idempotencyKey?: string) =>
    db.learnerEvent.create({
      data: { userId, type: 'ITEM_ATTEMPTED', occurredAt, payload: {}, idempotencyKey },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    learner = (await db.user.create({ data: { email: `${RUN}-a@test.local` } })).id;
    other = (await db.user.create({ data: { email: `${RUN}-b@test.local` } })).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('rejects a second event with the same key for the same user (P2002)', async () => {
    await event(learner, T0, KEY);
    await expect(event(learner, T0 + 1n, KEY)).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.learnerEvent.count({ where: { userId: learner, idempotencyKey: KEY } })).toBe(
      1,
    );
  });

  it('scopes the key to the user: another user may reuse it', async () => {
    await expect(event(other, T0, KEY)).resolves.toMatchObject({ idempotencyKey: KEY });
  });

  it('never collides on NULL: events without a key are unlimited', async () => {
    await event(learner, T0 + 10n);
    await event(learner, T0 + 11n);
    expect(await db.learnerEvent.count({ where: { userId: learner, idempotencyKey: null } })).toBe(
      2,
    );
  });

  it('lets exactly one of two concurrent inserts with the same key win', async () => {
    const key = `${KEY}-race`;
    const results = await Promise.allSettled([
      event(learner, T0 + 20n, key),
      event(learner, T0 + 21n, key),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'P2002' },
    });
  });
});
