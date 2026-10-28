import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signIn, redirectAfterAuth, AuthError, CredentialsSignin } = vi.hoisted(() => {
  class AuthError extends Error {
    type = 'AuthError';
  }
  class CredentialsSignin extends AuthError {
    override type = 'CredentialsSignin';
    code = 'credentials';
  }
  return { signIn: vi.fn(), redirectAfterAuth: vi.fn(), AuthError, CredentialsSignin };
});
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ AuthError, CredentialsSignin }));
vi.mock('@/lib/auth', () => ({ signIn }));
vi.mock('@/lib/auth-redirect', () => ({ redirectAfterAuth }));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));

const { login } = await import('@/app/[locale]/(auth)/login/actions');

function form(): FormData {
  const data = new FormData();
  data.set('email', 'ada@example.com');
  data.set('password', 'guess');
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('login', () => {
  it('reports throttling apart from a wrong password', async () => {
    const throttled = new CredentialsSignin();
    throttled.code = 'rate_limited';
    signIn.mockRejectedValueOnce(throttled).mockRejectedValueOnce(new CredentialsSignin());

    expect(await login(null, form())).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(await login(null, form())).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  it('maps other Auth.js errors to AUTH_FAILED', async () => {
    signIn.mockRejectedValue(new AuthError());
    expect(await login(null, form())).toEqual({ ok: false, error: 'AUTH_FAILED' });
  });
});
