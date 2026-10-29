import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fns with it.
const {
  findUnique,
  create,
  signIn,
  redirectAfterAuth,
  consumeRateLimit,
  KnownRequestError,
  cookieJar,
  deleteCookie,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  signIn: vi.fn(),
  redirectAfterAuth: vi.fn(),
  consumeRateLimit: vi.fn(),
  KnownRequestError: class extends Error {
    code = '';
  },
  cookieJar: new Map<string, string>(),
  deleteCookie: vi.fn(),
}));
vi.mock('@englishlearn/db', () => ({
  prisma: { user: { findUnique, create } },
  Prisma: { PrismaClientKnownRequestError: KnownRequestError },
}));
vi.mock('@/lib/auth', () => ({ signIn }));
vi.mock('@/lib/auth-redirect', () => ({ redirectAfterAuth }));
vi.mock('@englishlearn/db/queries/rate-limit', () => ({
  consumeRateLimit,
  rateLimitDisabled: () => false,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.4' }),
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete: (name: string) => {
      deleteCookie(name);
      cookieJar.delete(name);
    },
  }),
}));
vi.mock('server-only', () => ({}));

const { registerUser } = await import('@/app/[locale]/(auth)/register/actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: 'Ada', email: 'ada@example.com', password: 'correct-horse' };

describe('registerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  });

  it('creates a STUDENT with an empty profile in the same insert', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'user_1' });

    await registerUser(null, form(valid));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: valid.email,
        role: 'STUDENT',
        profile: { create: {} },
      }),
    });
    expect(redirectAfterAuth).toHaveBeenCalledTimes(1);
  });

  it('writes a valid signup_ref cookie as signupSource and clears the cookie', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'user_1' });
    cookieJar.set('signup_ref', 'beta-invite');

    await registerUser(null, form(valid));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ signupSource: 'beta-invite' }),
    });
    expect(deleteCookie).toHaveBeenCalledWith('signup_ref');
    expect(cookieJar.has('signup_ref')).toBe(false);
    expect(redirectAfterAuth).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no cookie', undefined],
    ['a spoofed value', "x'; DROP TABLE users;--"],
    ['an underscore', 'beta_invite'],
    ['an oversized value', 'x'.repeat(33)],
  ])('signs up with a null signupSource given %s', async (_case, value) => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'user_1' });
    if (value !== undefined) cookieJar.set('signup_ref', value);

    const result = await registerUser(null, form(valid));

    expect(result).not.toMatchObject({ ok: false });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ signupSource: null }),
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(redirectAfterAuth).toHaveBeenCalledTimes(1);
  });

  it('keeps the signup_ref cookie when the email is taken', async () => {
    findUnique.mockResolvedValue({ id: 'existing' });
    cookieJar.set('signup_ref', 'reddit');

    await registerUser(null, form(valid));

    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it('returns EMAIL_TAKEN and never creates when the email is in use', async () => {
    findUnique.mockResolvedValue({ id: 'existing' });

    const result = await registerUser(null, form(valid));

    expect(result).toMatchObject({ ok: false, error: 'EMAIL_TAKEN' });
    expect(create).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot like a sign-up and writes nothing', async () => {
    await registerUser(null, form({ ...valid, website: 'https://spam.example' }));

    expect(redirectAfterAuth).toHaveBeenCalledTimes(1);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('throttles sign-ups per IP before looking the email up', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const result = await registerUser(null, form(valid));

    expect(result).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), {
      key: 'register:ip:198.51.100.4',
      limit: 5,
      windowMs: 3_600_000,
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
