import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeRateLimit, rateLimitDisabled } from '../rate-limit';

// The e2e switch only; counting itself is proven against Postgres in rate-limit.db.test.ts.

afterEach(() => {
  vi.unstubAllEnvs();
});

const input = { key: 'login:ip:127.0.0.1', limit: 1, windowMs: 60_000 };

describe('DISABLE_RATE_LIMIT', () => {
  it('lets every hit through without touching the database', async () => {
    vi.stubEnv('DISABLE_RATE_LIMIT', 'true');
    vi.stubEnv('VERCEL', '');
    const db = { $queryRaw: vi.fn() };

    const result = await consumeRateLimit(db as never, input);

    expect(result).toMatchObject({ allowed: true, remaining: 999 });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('is ignored on Vercel', () => {
    vi.stubEnv('DISABLE_RATE_LIMIT', 'true');
    vi.stubEnv('VERCEL', '1');
    expect(rateLimitDisabled()).toBe(false);
  });

  it.each(['', '1', 'TRUE', 'false'])('stays on for DISABLE_RATE_LIMIT=%j', (value) => {
    vi.stubEnv('DISABLE_RATE_LIMIT', value);
    vi.stubEnv('VERCEL', '');
    expect(rateLimitDisabled()).toBe(false);
  });
});
