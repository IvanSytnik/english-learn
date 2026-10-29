import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import {
  DEFAULT_DAILY_VOCAB_LIMIT,
  getDailyVocabLimit,
  setDailyVocabLimit,
} from '../vocab-session';

/**
 * The daily new-word limit setter on real Postgres (B2.6): validated against
 * the CHECK's range before any write, a missing profile created first, the
 * CHECK itself still the last line. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI).
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the daily vocab limit DB test would be skipped',
  );
}

const RUN = `test-dvl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('daily vocabulary limit (real Postgres)', () => {
  let db: PrismaClient;
  let n = 0;

  const newUser = async (withProfile: boolean) =>
    (
      await db.user.create({
        data: {
          email: `${RUN}-${n++}@test.dev`,
          ...(withProfile ? { profile: { create: {} } } : {}),
        },
      })
    ).id;

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('stores a limit in range and reads it back', async () => {
    const userId = await newUser(true);
    expect(await getDailyVocabLimit(db, userId)).toBe(DEFAULT_DAILY_VOCAB_LIMIT);
    for (const limit of [1, 25, 50]) {
      await setDailyVocabLimit(db, userId, limit);
      expect(await getDailyVocabLimit(db, userId)).toBe(limit);
    }
  });

  it('creates a missing profile instead of failing', async () => {
    const userId = await newUser(false);
    await setDailyVocabLimit(db, userId, 15);
    expect(await getDailyVocabLimit(db, userId)).toBe(15);
    expect(await db.studentProfile.count({ where: { userId } })).toBe(1);
  });

  it.each([
    0,
    51,
    -3,
    2.5,
    Number.NaN,
  ])('refuses %s and leaves the profile untouched', async (limit) => {
    const userId = await newUser(false);
    await expect(setDailyVocabLimit(db, userId, limit)).rejects.toThrow();
    // Validated before anything is written: not even a profile is created.
    expect(await db.studentProfile.count({ where: { userId } })).toBe(0);
  });

  it('the CHECK still refuses an out-of-range write that skips validation', async () => {
    const userId = await newUser(true);
    await expect(
      db.studentProfile.update({ where: { userId }, data: { dailyVocabLimit: 51 } }),
    ).rejects.toThrow(/StudentProfile_dailyVocabLimit_range/);
  });
});
