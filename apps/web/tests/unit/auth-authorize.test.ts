import { hash } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the config lib/auth.ts hands to NextAuth, to call `authorize` directly.
const { findUnique, compare, consumeRateLimit, captured } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
  consumeRateLimit: vi.fn(),
  captured: {
    config: null as null | { providers: { authorize: (c: unknown, r: Request) => unknown }[] },
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { user: { findUnique } } }));
vi.mock('@englishlearn/db/queries/rate-limit', () => ({
  consumeRateLimit,
  rateLimitDisabled: () => false,
}));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
vi.mock('next-auth/providers/credentials', () => ({ default: (options: unknown) => options }));
vi.mock('next-auth', () => ({
  CredentialsSignin: class extends Error {
    code = 'credentials';
  },
  default: (config: typeof captured.config) => {
    captured.config = config;
    return {};
  },
}));
vi.mock('bcryptjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('bcryptjs')>();
  compare.mockImplementation(real.compare);
  return { ...real, compare };
});

await import('@/lib/auth');

const authorize = (credentials: Record<string, string>) =>
  captured.config?.providers[0]?.authorize(
    credentials,
    new Request('http://localhost/', { headers: { 'x-forwarded-for': '192.0.2.9' } }),
  );

const ALLOW = { allowed: true, remaining: 1, resetAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  consumeRateLimit.mockResolvedValue(ALLOW);
});

describe('credentials authorize', () => {
  it('signs in with the right password', async () => {
    findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'ada@example.com',
      name: 'Ada',
      image: null,
      role: 'STUDENT',
      passwordHash: await hash('correct-horse', 4),
    });
    expect(await authorize({ email: 'ada@example.com', password: 'correct-horse' })).toMatchObject({
      id: 'user_1',
      role: 'STUDENT',
    });
  });

  it.each([
    ['an unknown email', null],
    ['an account without a password', { id: 'user_2', passwordHash: null }],
  ])('runs a cost-10 dummy compare for %s', async (_, user) => {
    findUnique.mockResolvedValue(user);

    expect(await authorize({ email: 'x@example.com', password: 'guess' })).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    const [password, dummy] = compare.mock.calls[0] ?? [];
    expect(password).toBe('guess');
    expect(dummy).toMatch(/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
  });
});

describe('login throttling', () => {
  it('counts every attempt by IP and lower-cased email', async () => {
    findUnique.mockResolvedValue(null);
    await authorize({ email: 'Ada@Example.com', password: 'guess' });

    expect(consumeRateLimit.mock.calls.map(([, o]) => o)).toEqual([
      { key: 'login:ip:192.0.2.9', limit: 10, windowMs: 60_000 },
      { key: 'login:email:ada@example.com', limit: 5, windowMs: 900_000 },
    ]);
  });

  it('refuses with rate_limited before checking the password', async () => {
    consumeRateLimit
      .mockResolvedValueOnce(ALLOW)
      .mockResolvedValueOnce({ ...ALLOW, allowed: false });

    await expect(authorize({ email: 'ada@example.com', password: 'guess' })).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });
});

describe('session callbacks', () => {
  it('wraps jwt with the password-change revocation', async () => {
    const { jwtWithRevocation } = await import('@/lib/auth/session-revocation');
    const config = captured.config as unknown as { callbacks: { jwt: unknown } };
    expect(config.callbacks.jwt).toBe(jwtWithRevocation);
  });
});
