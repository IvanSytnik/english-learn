import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { user: { findUnique } } }));

const { issuedBeforePasswordChange, jwtWithRevocation, revokeIfStale } = await import(
  '@/lib/auth/session-revocation'
);

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
    findUnique.mockResolvedValue({ passwordChangedAt: CHANGED });
    expect(await revokeIfStale(token)).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { passwordChangedAt: true },
    });
  });

  it('keeps a token when the password has not changed since', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: null });
    expect(await revokeIfStale(token)).toBe(token);
  });

  it('drops the token of a deleted user', async () => {
    findUnique.mockResolvedValue(null);
    expect(await revokeIfStale(token)).toBeNull();
  });

  it('fails open on a database error', async () => {
    findUnique.mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await revokeIfStale(token)).toBe(token);
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
    findUnique.mockResolvedValue({ passwordChangedAt: CHANGED });
    const result = await jwtWithRevocation({
      token: { id: 'user_1', role: 'STUDENT', iat: CHANGED_S - 1 },
    } as never);
    expect(result).toBeNull();
  });
});
