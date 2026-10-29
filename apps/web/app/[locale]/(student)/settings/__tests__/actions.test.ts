import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fns with it.
const {
  auth,
  signOut,
  findUnique,
  deleteUser,
  transaction,
  compare,
  setNativeLanguage,
  getUserExportData,
  withinAuthLimits,
  deletePasswordResetTokens,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  signOut: vi.fn(),
  findUnique: vi.fn(),
  deleteUser: vi.fn(),
  transaction: vi.fn(),
  compare: vi.fn(),
  setNativeLanguage: vi.fn(),
  getUserExportData: vi.fn(),
  withinAuthLimits: vi.fn(),
  deletePasswordResetTokens: vi.fn(),
}));
const prisma = { user: { findUnique, delete: deleteUser }, $transaction: transaction };

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ setNativeLanguage }));
vi.mock('@englishlearn/db/queries/user-export', () => ({ getUserExportData }));
vi.mock('bcryptjs', () => ({ compare }));
vi.mock('@/lib/auth', () => ({ auth, signOut }));
vi.mock('@/lib/auth/rate-limit', () => ({ withinAuthLimits }));
vi.mock('@/lib/auth/password-reset', () => ({ deletePasswordResetTokens }));

const { deleteAccountAction, exportUserDataAction, updateNativeLanguageAction } = await import(
  '@/app/[locale]/(student)/settings/actions'
);

const HASH = '$2b$10$storedhash';
const PAYLOAD = { user: { id: 'user-1', email: 'ada@test.local' }, learnerEvents: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
  signOut.mockResolvedValue(undefined);
  findUnique.mockResolvedValue({ email: 'ada@test.local', passwordHash: HASH });
  deleteUser.mockReturnValue('delete-user');
  deletePasswordResetTokens.mockReturnValue('delete-tokens');
  transaction.mockResolvedValue([]);
  compare.mockResolvedValue(true);
  setNativeLanguage.mockResolvedValue(undefined);
  getUserExportData.mockResolvedValue(PAYLOAD);
  withinAuthLimits.mockResolvedValue(true);
});

describe('updateNativeLanguageAction', () => {
  it("stores the language for the session's user", async () => {
    expect(await updateNativeLanguageAction({ language: 'de', userId: 'someone-else' })).toEqual({
      ok: true,
      value: { success: true },
    });
    expect(setNativeLanguage).toHaveBeenCalledWith(prisma, 'user-1', 'de');
  });

  it('refuses a signed-out user and a non-student without writing', async () => {
    auth.mockResolvedValueOnce(null);
    expect(await updateNativeLanguageAction({ language: 'de' })).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
    });
    auth.mockResolvedValueOnce({ user: { id: 'admin-1', role: 'ADMIN' } });
    expect(await updateNativeLanguageAction({ language: 'de' })).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
    });
    expect(setNativeLanguage).not.toHaveBeenCalled();
  });

  it.each([
    [{ language: 'pl' }],
    [{ language: 'en' }],
    [{}],
    ['de'],
    [null],
  ])('rejects %j as a validation error', async (input) => {
    expect(await updateNativeLanguageAction(input)).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(setNativeLanguage).not.toHaveBeenCalled();
  });

  it('hides a database failure behind INTERNAL_ERROR', async () => {
    setNativeLanguage.mockRejectedValue(new Error('connection reset: secret-host:5432'));
    expect(await updateNativeLanguageAction({ language: 'uk' })).toEqual({
      ok: false,
      error: 'INTERNAL_ERROR',
    });
  });
});

describe('exportUserDataAction', () => {
  it("returns the session's user's export", async () => {
    expect(await exportUserDataAction()).toEqual({ ok: true, value: PAYLOAD });
    expect(getUserExportData).toHaveBeenCalledWith(prisma, 'user-1');
  });

  it('refuses a signed-out user without reading anything', async () => {
    auth.mockResolvedValue(null);
    expect(await exportUserDataAction()).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(getUserExportData).not.toHaveBeenCalled();
  });

  it('treats a user deleted since sign-in as signed out', async () => {
    getUserExportData.mockResolvedValue(null);
    expect(await exportUserDataAction()).toEqual({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('hides a database failure behind INTERNAL_ERROR', async () => {
    getUserExportData.mockRejectedValue(new Error('connection reset: secret-host:5432'));
    expect(await exportUserDataAction()).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
  });
});

describe('deleteAccountAction', () => {
  it('checks the password against the stored hash, deletes the user with its reset links, signs out', async () => {
    expect(await deleteAccountAction({ password: 'correct horse' })).toEqual({
      ok: true,
      value: { success: true },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { email: true, passwordHash: true },
    });
    expect(compare).toHaveBeenCalledWith('correct horse', HASH);
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(deletePasswordResetTokens).toHaveBeenCalledWith(prisma, 'ada@test.local');
    expect(transaction).toHaveBeenCalledWith(['delete-tokens', 'delete-user']);
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it('deletes only the session user, whatever id the input names', async () => {
    await deleteAccountAction({ password: 'correct horse', userId: 'someone-else' });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('refuses a wrong password and deletes nothing', async () => {
    compare.mockResolvedValue(false);
    expect(await deleteAccountAction({ password: 'wrong' })).toEqual({
      ok: false,
      error: 'INVALID_PASSWORD',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('refuses an account without a password: nothing can prove the owner', async () => {
    findUnique.mockResolvedValue({ email: 'ada@test.local', passwordHash: null });
    expect(await deleteAccountAction({ password: 'anything' })).toEqual({
      ok: false,
      error: 'INVALID_PASSWORD',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a signed-out user before reading or comparing', async () => {
    auth.mockResolvedValue(null);
    expect(await deleteAccountAction({ password: 'correct horse' })).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ password: '' }],
    [{ password: 42 }],
    [{ password: 'a'.repeat(1025) }],
    ['pw'],
  ])('rejects %j as a validation error before comparing', async (input) => {
    expect(await deleteAccountAction(input)).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
    expect(compare).not.toHaveBeenCalled();
    expect(withinAuthLimits).not.toHaveBeenCalled();
  });

  it('throttles attempts per user before comparing', async () => {
    withinAuthLimits.mockResolvedValue(false);
    expect(await deleteAccountAction({ password: 'correct horse' })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    });
    expect(withinAuthLimits).toHaveBeenCalledWith([['delete:user', 'user-1']]);
    expect(compare).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('hides a failed delete behind INTERNAL_ERROR and keeps the session', async () => {
    transaction.mockRejectedValue(new Error('deadlock detected on "User"'));
    expect(await deleteAccountAction({ password: 'correct horse' })).toEqual({
      ok: false,
      error: 'INTERNAL_ERROR',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('still reports success when the account is gone but signing out throws', async () => {
    signOut.mockRejectedValue(new Error('cookies() outside a request'));
    expect(await deleteAccountAction({ password: 'correct horse' })).toEqual({
      ok: true,
      value: { success: true },
    });
  });
});
