import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { hasLearnerBootstrapped } from '../learner-activity';

/**
 * hasLearnerBootstrapped against a real, migrated Postgres: the flag that
 * routes the dashboard CTA must see only THIS learner's LEARNER_BOOTSTRAPPED.
 * Same gate as the other DB tests (DIAG_DB_TEST_URL; required in CI). The
 * events are raw fixture rows on a throwaway database; deleting the users
 * cascades to them.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the learner activity DB test would be skipped',
  );
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('hasLearnerBootstrapped (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  async function newUser(): Promise<string> {
    const user = await db.user.create({
      data: { email: `activity-${RUN}-${userIds.length}@test.local` },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  const event = (userId: string, type: 'ITEM_ATTEMPTED' | 'LEARNER_BOOTSTRAPPED', at: number) =>
    db.learnerEvent.create({ data: { userId, type, occurredAt: BigInt(at), payload: {} } });

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('practice alone is not a bootstrap; the bootstrap event is', async () => {
    const userId = await newUser();
    expect(await hasLearnerBootstrapped(db, userId)).toBe(false);
    await event(userId, 'ITEM_ATTEMPTED', 1_000);
    expect(await hasLearnerBootstrapped(db, userId)).toBe(false);
    await event(userId, 'LEARNER_BOOTSTRAPPED', 2_000);
    expect(await hasLearnerBootstrapped(db, userId)).toBe(true);
  });

  it('another learner’s bootstrap does not count', async () => {
    const other = await newUser();
    const userId = await newUser();
    await event(other, 'LEARNER_BOOTSTRAPPED', 1_000);
    await event(userId, 'ITEM_ATTEMPTED', 1_000);
    expect(await hasLearnerBootstrapped(db, userId)).toBe(false);
  });
});
