import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fns with it.
const { findUnique, create, signIn, redirectAfterAuth, consumeRateLimit, KnownRequestError } =
  vi.hoisted(() => ({
    findUnique: vi.fn(),
    create: vi.fn(),
    signIn: vi.fn(),
    redirectAfterAuth: vi.fn(),
    consumeRateLimit: vi.fn(),
    KnownRequestError: class extends Error {
      code = '';
    },
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
