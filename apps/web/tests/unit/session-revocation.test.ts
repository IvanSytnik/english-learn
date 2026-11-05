import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, auth } = vi.hoisted(() => ({ findUnique: vi.fn(), auth: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { user: { findUnique } } }));
// requireRole reads auth(); here auth() is the real callback chain over a mocked DB.
vi.mock('@/lib/auth', () => ({ auth }));

const { issuedBeforePasswordChange, jwtWithRevocation, revokeIfStale } = await import(
  '@/lib/auth/session-revocation'
);
const { authConfig } = await import('@/lib/auth.config');
const { requireRole } = await import('@/lib/authz');

const CHANGED = new Date('2026-10-29T12:00:00.500Z');
const CHANGED_S = Math.floor(CHANGED.getTime() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('issuedBeforePasswordChange', () => {
  it('keeps every token while the password was never changed', () => {
    expect(issuedBeforePasswordChange(1, null)).toBe(false);
  });

  it('revokes tokens from before the change, keeps the ones after', () => {
    expect(issuedBeforePasswordChange(CHANGED_S - 1, CHANGED)).toBe(true);
    expect(issuedBeforePasswordChange(CHANGED_S + 1, CHANGED)).toBe(false);
  });

  it('keeps a token signed in the same second as the change', () => {
    expect(issuedBeforePasswordChange(CHANGED_S, CHANGED)).toBe(false);
  });

  it('revokes a token without iat once a change exists', () => {
    expect(issuedBeforePasswordChange(undefined, CHANGED)).toBe(true);
  });
});

describe('revokeIfStale', () => {
  const token = { id: 'user_1', role: 'STUDENT' as const, iat: CHANGED_S - 60 };

  it('drops a token older than the password change', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: CHANGED, role: 'STUDENT' });
    expect(await revokeIfStale(token)).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { passwordChangedAt: true, role: true },
    });
  });

  it('keeps a token when the password has not changed since', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: null, role: 'STUDENT' });
    expect(await revokeIfStale(token)).toBe(token);
  });

  it('refreshes the role from the database (V2-15)', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: null, role: 'ADMIN' });
    expect(await revokeIfStale(token)).toEqual({ ...token, role: 'ADMIN' });
  });

  it('a revoked token stays revoked whatever the role', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: CHANGED, role: 'ADMIN' });
    expect(await revokeIfStale(token)).toBeNull();
  });

  it('drops the token of a deleted user', async () => {
    findUnique.mockResolvedValue(null);
    expect(await revokeIfStale(token)).toBeNull();
  });

  it('fails open on a database error: the token, role included, is unchanged', async () => {
    findUnique.mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = { ...token, role: 'ADMIN' as const };
    expect(await revokeIfStale(admin)).toBe(admin);
    expect(admin.role).toBe('ADMIN');
  });

  it('leaves a token without a user id alone', async () => {
    expect(await revokeIfStale({ iat: 1 })).toEqual({ iat: 1 });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('jwtWithRevocation', () => {
  it('copies id and role on sign-in without a lookup', async () => {
    const result = await jwtWithRevocation({
      token: {},
      user: { id: 'user_1', role: 'ADMIN' },
      account: null,
    } as never);
    expect(result).toMatchObject({ id: 'user_1', role: 'ADMIN' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('checks an existing session against passwordChangedAt', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: CHANGED, role: 'STUDENT' });
    const result = await jwtWithRevocation({
      token: { id: 'user_1', role: 'STUDENT', iat: CHANGED_S - 1 },
    } as never);
    expect(result).toBeNull();
  });
});

describe('a demotion takes effect on the next request (V2-15)', () => {
  // The chain every gate reads: jwt callback (with the DB read) → session
  // callback → session.user.role → requireRole / authorizeAction.
  const ADMIN_TOKEN = { id: 'user_1', role: 'ADMIN' as const, iat: CHANGED_S };
  const NOT_FOUND = { digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) };

  async function sessionFor(token: typeof ADMIN_TOKEN) {
    const refreshed = await jwtWithRevocation({ token } as never);
    if (!refreshed) return null;
    return authConfig.callbacks.session({
      session: { user: { id: '', role: 'STUDENT' }, expires: '2099-01-01T00:00:00.000Z' },
      token: refreshed,
    } as never);
  }

  beforeEach(() => {
    auth.mockImplementation(() => sessionFor(ADMIN_TOKEN));
  });

  it('ADMIN demoted to STUDENT in the database: the next request is a STUDENT, admin 404s', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: null, role: 'STUDENT' });
    expect((await sessionFor(ADMIN_TOKEN))?.user.role).toBe('STUDENT');
    await expect(requireRole('ADMIN')).rejects.toMatchObject(NOT_FOUND);
    await expect(requireRole('STUDENT')).resolves.toMatchObject({ role: 'STUDENT' });
  });

  it('still an ADMIN in the database: admin pages open', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: null, role: 'ADMIN' });
    await expect(requireRole('ADMIN')).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('the database is down: the session keeps the role of the token, as before', async () => {
    findUnique.mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await sessionFor(ADMIN_TOKEN))?.user.role).toBe('ADMIN');
  });
});
