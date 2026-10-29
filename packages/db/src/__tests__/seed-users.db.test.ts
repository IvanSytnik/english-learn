import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../create-client';
import type { PrismaClient } from '../generated/client/client';
import { SEED_ADMIN_EMAIL, SEED_STUDENT_EMAIL, seedUsers } from '../seed-users';

/**
 * `pnpm db:seed` must be safe to re-run on dev: against a real, migrated
 * Postgres (DIAG_DB_TEST_URL), two runs leave exactly one row per account and
 * per profile, with the first run's ids, password hashes and profile untouched.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the seed DB tests would be skipped');
}

const EMAILS = [SEED_ADMIN_EMAIL, SEED_STUDENT_EMAIL];

describe.skipIf(!url)('seedUsers (real Postgres)', () => {
  let db: PrismaClient;
  let preexisting = 0;

  const snapshot = async () => {
    const users = await db.user.findMany({
      where: { email: { in: EMAILS } },
      select: { id: true, email: true, passwordHash: true },
      orderBy: { email: 'asc' },
    });
    const profiles = await db.studentProfile.findMany({
      where: { user: { email: { in: EMAILS } } },
      select: { id: true, userId: true, nativeLanguage: true, selfReportedLevel: true, goal: true },
    });
    return { users, profiles };
  };

  beforeAll(async () => {
    db = createPrismaClient(url);
    preexisting = await db.user.count({ where: { email: { in: EMAILS } } });
  });

  afterAll(async () => {
    if (!db) return;
    // Leave a database that already had the accounts as it was.
    if (preexisting === 0) await db.user.deleteMany({ where: { email: { in: EMAILS } } });
    await db.$disconnect();
  });

  it('a second run creates no duplicates and changes nothing', async () => {
    await seedUsers(db);
    const first = await snapshot();
    expect(first.users.map((u) => u.email)).toEqual([SEED_ADMIN_EMAIL, SEED_STUDENT_EMAIL]);
    expect(first.profiles).toHaveLength(1);

    await seedUsers(db);
    expect(await snapshot()).toEqual(first);
    // Four bcryptjs hashes (pure JS, cost 10): past the 5 s default when
    // turbo runs every package's tests at once.
  }, 30_000);
});
