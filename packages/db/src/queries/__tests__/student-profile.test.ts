import { describe, expect, it, vi } from 'vitest';

import type { NativeLanguage } from '../../schemas/native-language';
import { ensureStudentProfile, getNativeLanguage, setNativeLanguage } from '../student-profile';

type Db = Parameters<typeof ensureStudentProfile>[0];

function mockDb(profile: { nativeLanguage: string | null } | null = null) {
  const studentProfile = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(profile),
    update: vi.fn().mockResolvedValue({}),
  };
  return { db: { studentProfile } as unknown as Db, studentProfile };
}

describe('ensureStudentProfile', () => {
  it('inserts an empty profile and skips it if one already exists', async () => {
    const { db, studentProfile } = mockDb();

    await ensureStudentProfile(db, 'user_1');

    expect(studentProfile.createMany).toHaveBeenCalledTimes(1);
    expect(studentProfile.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user_1' }],
      skipDuplicates: true,
    });
  });
});

describe('getNativeLanguage', () => {
  it('is null without a profile and for an unset language — never a default', async () => {
    expect(await getNativeLanguage(mockDb(null).db, 'user_1')).toBeNull();
    expect(await getNativeLanguage(mockDb({ nativeLanguage: null }).db, 'user_1')).toBeNull();
  });

  it('returns the stored value as is, even one outside the list', async () => {
    expect(await getNativeLanguage(mockDb({ nativeLanguage: 'uk' }).db, 'user_1')).toBe('uk');
    expect(await getNativeLanguage(mockDb({ nativeLanguage: 'pl' }).db, 'user_1')).toBe('pl');
  });
});

describe('setNativeLanguage', () => {
  it('makes sure the profile exists, then writes the choice', async () => {
    const { db, studentProfile } = mockDb();

    await setNativeLanguage(db, 'user_1', 'other');

    expect(studentProfile.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user_1' }],
      skipDuplicates: true,
    });
    expect(studentProfile.update).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      data: { nativeLanguage: 'other' },
    });
    expect(studentProfile.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      studentProfile.update.mock.invocationCallOrder[0] as number,
    );
  });

  it('rejects a value outside the list before touching the database', async () => {
    for (const value of ['en', 'pl', '', 'RU']) {
      const { db, studentProfile } = mockDb();
      await expect(setNativeLanguage(db, 'user_1', value as NativeLanguage)).rejects.toThrow();
      expect(studentProfile.createMany).not.toHaveBeenCalled();
      expect(studentProfile.update).not.toHaveBeenCalled();
    }
  });
});
