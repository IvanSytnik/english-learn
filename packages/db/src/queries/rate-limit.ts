import type { PrismaClient } from '../generated/client/client';

export type RateLimitInput = {
  /** `<action>:<subject>`, e.g. `login:ip:203.0.113.7`. */
  key: string;
  /** Hits allowed per window; the `limit + 1`-th is refused. */
  limit: number;
  windowMs: number;
  /**
   * How many hits this call is (a positive integer, default 1): a bulk write
   * of n words costs n (B6.6 `vocab-pref:user`).
   */
  cost?: number;
  /** Injectable clock for tests. */
  now?: Date;
};

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

/**
 * `DISABLE_RATE_LIMIT=true` turns throttling off for e2e, where every request
 * comes from one localhost IP. Ignored on Vercel (`VERCEL=1`), so a stray
 * variable can never switch it off in a deployment.
 */
export function rateLimitDisabled(): boolean {
  return process.env.DISABLE_RATE_LIMIT === 'true' && process.env.VERCEL !== '1';
}

/**
 * Count one hit against `key` in a fixed window. A single INSERT … ON CONFLICT
 * so concurrent hits never lose an increment; an expired row restarts at 1
 * with a fresh window. Refused hits still count, so hammering a blocked key
 * does not let it through early — the window end stays put.
 */
export async function consumeRateLimit(
  db: Pick<PrismaClient, '$queryRaw'>,
  { key, limit, windowMs, cost = 1, now = new Date() }: RateLimitInput,
): Promise<RateLimitResult> {
  if (rateLimitDisabled()) return { allowed: true, remaining: 999, resetAt: now };
  if (!Number.isInteger(cost) || cost < 1) throw new Error(`consumeRateLimit: bad cost ${cost}`);
  const freshExpiry = new Date(now.getTime() + windowMs);
  const [row] = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt", "createdAt")
    VALUES (${key}, ${cost}, ${freshExpiry}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
        THEN ${cost} ELSE "AuthRateLimit"."count" + ${cost} END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
        THEN ${freshExpiry} ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  if (!row) throw new Error('consumeRateLimit: upsert returned no row');

  const count = Number(row.count);
  const resetAt = new Date(row.expiresAt);
  if (count > limit) return { allowed: false, remaining: 0, resetAt };
  return { allowed: true, remaining: limit - count, resetAt };
}
