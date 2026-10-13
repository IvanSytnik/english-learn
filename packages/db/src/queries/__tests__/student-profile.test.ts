import { describe, expect, it, vi } from 'vitest';

import { ensureStudentProfile } from '../student-profile';

describe('ensureStudentProfile', () => {
  it('inserts an empty profile and skips it if one already exists', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { studentProfile: { createMany } } as unknown as Parameters<
      typeof ensureStudentProfile
    >[0];

    await ensureStudentProfile(db, 'user_1');

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({ data: [{ userId: 'user_1' }], skipDuplicates: true });
  });
});
