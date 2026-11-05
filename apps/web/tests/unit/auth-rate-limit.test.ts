import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consumeRateLimit, rateLimitDisabled } = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  rateLimitDisabled: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/rate-limit', () => ({ consumeRateLimit, rateLimitDisabled }));

const { AUTH_LIMITS, withinAuthLimits } = await import('@/lib/auth/rate-limit');

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitDisabled.mockReturnValue(false);
  consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: new Date() });
});

describe('withinAuthLimits', () => {
  it('word preferences (B6.6): 300 writes per user per hour', () => {
    expect(AUTH_LIMITS['vocab-pref:user']).toEqual({ limit: 300, windowMs: 3_600_000 });
  });

  it('a bulk write passes its cost; a plain check costs the default single hit', async () => {
    expect(await withinAuthLimits([['vocab-pref:user', 'u1', 37]])).toBe(true);
    expect(consumeRateLimit).toHaveBeenCalledExactlyOnceWith(
      { tag: 'prisma' },
      { key: 'vocab-pref:user:u1', limit: 300, windowMs: 3_600_000, cost: 37 },
    );
    await withinAuthLimits([['feedback:user', 'u1']]);
    expect(consumeRateLimit).toHaveBeenLastCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({ key: 'feedback:user:u1', cost: undefined }),
    );
  });

  it('refused when any limit is exhausted', async () => {
    consumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date() });
    expect(await withinAuthLimits([['vocab-pref:user', 'u1', 200]])).toBe(false);
  });
});
