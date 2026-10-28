import type { PrismaClient } from '../generated/client/client';

export type RateLimitInput = {
  /** `<action>:<subject>`, e.g. `login:ip:203.0.113.7`. */
  key: string;
  /** Hits allowed per window; the `limit + 1`-th is refused. */
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: Date;
};

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

/**
 * Count one hit against `key` in a fixed window. A single INSERT … ON CONFLICT
 * so concurrent hits never lose an increment; an expired row restarts at 1
 * with a fresh window. Refused hits still count, so hammering a blocked key
 * does not let it through early — the window end stays put.
 */
export async function consumeRateLimit(
  db: Pick<PrismaClient, '$queryRaw'>,
  { key, limit, windowMs, now = new Date() }: RateLimitInput,
): Promise<RateLimitResult> {
  const freshExpiry = new Date(now.getTime() + windowMs);
  const [row] = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt", "createdAt")
    VALUES (${key}, 1, ${freshExpiry}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
        THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
        THEN ${freshExpiry} ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  if (!row) throw new Error('consumeRateLimit: upsert returned no row');

  const count = Number(row.count);
  const resetAt = new Date(row.expiresAt);
  if (count > limit) return { allowed: false, remaining: 0, resetAt };
  return { allowed: true, remaining: limit - count, resetAt };
}
