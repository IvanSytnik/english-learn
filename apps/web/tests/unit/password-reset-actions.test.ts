import { compare } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fns with it.
const {
  findUnique,
  updateMany,
  transaction,
  consumeRateLimit,
  after,
  headers,
  createPasswordResetToken,
  verifyAndConsumePasswordResetToken,
  sendPasswordResetEmail,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  consumeRateLimit: vi.fn(),
  after: vi.fn(),
  headers: vi.fn(),
  createPasswordResetToken: vi.fn(),
  verifyAndConsumePasswordResetToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({
  prisma: { user: { findUnique }, $transaction: transaction },
}));
vi.mock('@englishlearn/db/queries/rate-limit', () => ({
  consumeRateLimit,
  rateLimitDisabled: () => false,
}));
vi.mock('next/server', () => ({ after }));
vi.mock('next/headers', () => ({ headers }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'de' }));
vi.mock('@/lib/auth/password-reset', () => ({
  createPasswordResetToken,
  verifyAndConsumePasswordResetToken,
  passwordResetUrl: (locale: string, email: string, token: string) =>
    `https://app.example/${locale}/reset-password?token=${token}&email=${email}`,
}));
vi.mock('@/lib/email/mailer', () => ({ sendPasswordResetEmail }));

const { requestPasswordResetAction } = await import(
  '@/app/[locale]/(auth)/forgot-password/actions'
);
const { resetPasswordAction } = await import('@/app/[locale]/(auth)/reset-password/actions');

const RESET_AT = new Date();
const allow = { allowed: true, remaining: 1, resetAt: RESET_AT };
const deny = { allowed: false, remaining: 0, resetAt: RESET_AT };

/** Run what the action handed to `after()`, as Next does once the response is sent. */
async function runAfter() {
  for (const [task] of after.mock.calls) await (task as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
  consumeRateLimit.mockResolvedValue(allow);
  transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ user: { updateMany }, verificationToken: {} }),
  );
});

describe('requestPasswordResetAction', () => {
  it('answers success for an existing account and mails a localized link after the response', async () => {
    findUnique.mockResolvedValue({ email: 'ada@example.com' });
    createPasswordResetToken.mockResolvedValue('t'.repeat(64));

    const result = await requestPasswordResetAction({ email: 'ada@example.com' });

    expect(result).toEqual({ ok: true, value: { success: true } });
    // Nothing account-dependent ran before the response.
    expect(findUnique).not.toHaveBeenCalled();
    await runAfter();
    expect(createPasswordResetToken).toHaveBeenCalledWith(expect.anything(), 'ada@example.com');
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      url: `https://app.example/de/reset-password?token=${'t'.repeat(64)}&email=ada@example.com`,
      locale: 'de',
    });
  });

  it('answers the same for an unknown email and sends nothing', async () => {
    findUnique.mockResolvedValue(null);

    const result = await requestPasswordResetAction({ email: 'nobody@example.com' });

    expect(result).toEqual({ ok: true, value: { success: true } });
    await runAfter();
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('throttles by IP and by lower-cased email', async () => {
    await requestPasswordResetAction({ email: ' Ada@Example.com ' });

    expect(consumeRateLimit.mock.calls.map(([, o]) => o)).toEqual([
      { key: 'forgot:ip:203.0.113.7', limit: 10, windowMs: 3_600_000 },
      { key: 'forgot:email:ada@example.com', limit: 3, windowMs: 3_600_000 },
    ]);
  });

  it('refuses when a limit is exhausted, without scheduling an email', async () => {
    consumeRateLimit.mockResolvedValueOnce(allow).mockResolvedValueOnce(deny);

    const result = await requestPasswordResetAction({ email: 'ada@example.com' });

    expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(after).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before counting it', async () => {
    const result = await requestPasswordResetAction({ email: 'not-an-email' });

    expect(result).toEqual({ ok: false, error: 'INVALID_EMAIL' });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it('maps a database failure to FAILED without leaking it', async () => {
    consumeRateLimit.mockRejectedValue(new Error('connection refused at 10.0.0.5'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await requestPasswordResetAction({ email: 'ada@example.com' });

    expect(result).toEqual({ ok: false, error: 'FAILED' });
  });

  it('swallows a failure in the background step', async () => {
    findUnique.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await requestPasswordResetAction({ email: 'ada@example.com' });

    await expect(runAfter()).resolves.toBeUndefined();
  });
});

describe('resetPasswordAction', () => {
  const valid = { token: 'a'.repeat(64), email: 'ada@example.com', password: 'new-password-1' };

  it('consumes the token and stores a bcrypt hash with passwordChangedAt', async () => {
    verifyAndConsumePasswordResetToken.mockResolvedValue(true);
    updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    const result = await resetPasswordAction(valid);

    expect(result).toEqual({ ok: true, value: { success: true } });
    expect(verifyAndConsumePasswordResetToken).toHaveBeenCalledWith(expect.anything(), {
      email: valid.email,
      token: valid.token,
    });
    const { where, data } = updateMany.mock.calls[0]?.[0] ?? {};
    expect(where).toEqual({ email: valid.email });
    expect(data.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(await compare(valid.password, data.passwordHash)).toBe(true);
    expect(data.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('refuses an invalid or used token without writing', async () => {
    verifyAndConsumePasswordResetToken.mockResolvedValue(false);

    const result = await resetPasswordAction(valid);

    expect(result).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the account is gone', async () => {
    verifyAndConsumePasswordResetToken.mockResolvedValue(true);
    updateMany.mockResolvedValue({ count: 0 });

    expect(await resetPasswordAction(valid)).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });

  it.each([
    ['short', 'short', 'PASSWORD_TOO_SHORT'],
    ['long', 'x'.repeat(121), 'PASSWORD_TOO_LONG'],
  ])('rejects a too %s password before touching the token', async (_, password, error) => {
    const result = await resetPasswordAction({ ...valid, password });

    expect(result).toEqual({ ok: false, error });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('treats a malformed link as an invalid token', async () => {
    expect(await resetPasswordAction({ ...valid, email: 'nope' })).toEqual({
      ok: false,
      error: 'INVALID_TOKEN',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('maps a database failure to FAILED', async () => {
    transaction.mockRejectedValue(new Error('deadlock'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await resetPasswordAction(valid)).toEqual({ ok: false, error: 'FAILED' });
  });
});
