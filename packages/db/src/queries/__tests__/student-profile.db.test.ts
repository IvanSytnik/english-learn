import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import type { NativeLanguage } from '../../schemas/native-language';
import { getNativeLanguage, setNativeLanguage } from '../student-profile';

/**
 * Integration tests against a real, migrated Postgres (DIAG_DB_TEST_URL, as in
 * diagnostic-attempt.db.test.ts): the write must not hit "record not found"
 * for a user without a profile, and concurrent writes must not collide on the
 * unique userId — neither can be shown with mocks.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the student profile DB tests would be skipped',
  );
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('native language queries (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  async function newUser(withProfile: boolean): Promise<string> {
    const user = await db.user.create({
      data: {
        email: `profile-${RUN}-${userIds.length}@test.local`,
        ...(withProfile ? { profile: { create: {} } } : {}),
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  const stored = async (userId: string) =>
    (await db.studentProfile.findUnique({ where: { userId }, select: { nativeLanguage: true } }))
      ?.nativeLanguage;

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('reads null for a fresh profile and for a user with no profile at all', async () => {
    expect(await getNativeLanguage(db, await newUser(true))).toBeNull();
    expect(await getNativeLanguage(db, await newUser(false))).toBeNull();
  });

  it('writes the choice into an existing profile and overwrites it on a second choice', async () => {
    const userId = await newUser(true);
    await setNativeLanguage(db, userId, 'uk');
    expect(await getNativeLanguage(db, userId)).toBe('uk');
    await setNativeLanguage(db, userId, 'other');
    expect(await getNativeLanguage(db, userId)).toBe('other');
    expect(await db.studentProfile.count({ where: { userId } })).toBe(1);
  });

  it('creates the missing profile instead of failing with "record not found"', async () => {
    const userId = await newUser(false);
    await setNativeLanguage(db, userId, 'de');
    expect(await stored(userId)).toBe('de');
  });

  it('writes nothing for a value outside the list — not even the missing profile', async () => {
    const withProfile = await newUser(true);
    await setNativeLanguage(db, withProfile, 'ru');
    await expect(setNativeLanguage(db, withProfile, 'pl' as NativeLanguage)).rejects.toThrow();
    expect(await stored(withProfile)).toBe('ru');

    const withoutProfile = await newUser(false);
    await expect(setNativeLanguage(db, withoutProfile, 'en' as NativeLanguage)).rejects.toThrow();
    expect(await db.studentProfile.count({ where: { userId: withoutProfile } })).toBe(0);
  });

  it('survives concurrent first writes for a user without a profile', async () => {
    const userId = await newUser(false);
    const results = await Promise.allSettled(
      (['ru', 'uk', 'de', 'other'] as const).map((language) =>
        setNativeLanguage(db, userId, language),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(4).fill('fulfilled'));
    expect(await db.studentProfile.count({ where: { userId } })).toBe(1);
    expect(['ru', 'uk', 'de', 'other']).toContain(await stored(userId));
  });

  it('reads a stored value outside the list as is', async () => {
    const userId = await newUser(true);
    await db.studentProfile.update({ where: { userId }, data: { nativeLanguage: 'pl' } });
    expect(await getNativeLanguage(db, userId)).toBe('pl');
  });
});
