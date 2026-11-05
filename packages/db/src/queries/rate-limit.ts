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

/** The transaction client a metered write runs in. */
export type MeteredTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type MeteredWriteResult<T> =
  | { allowed: true; value: T; remaining: number }
  | { allowed: false; resetAt: Date };

class OverBudget extends Error {
  constructor(readonly resetAt: Date) {
    super('metered write over budget');
  }
}

/**
 * A write metered by the rows it actually writes (B6.7, HANDOFF #30): the
 * budget row of `key` is locked first, `write` runs in the same transaction
 * and reports `written`, and the key is charged exactly that. A write that
 * would take the window past `limit` is rolled back and costs nothing; a
 * write of 0 rows (a repeat, nothing to do) costs nothing and is never
 * refused. The lock serializes concurrent writes of one key, so the count
 * can neither go stale nor overshoot.
 *
 * Unlike consumeRateLimit, a refused call is not counted: it wrote nothing.
 */
export async function meteredWrite<T>(
  db: Pick<PrismaClient, '$transaction'>,
  { key, limit, windowMs, now = new Date() }: Omit<RateLimitInput, 'cost'>,
  write: (tx: MeteredTx) => Promise<{ written: number; value: T }>,
): Promise<MeteredWriteResult<T>> {
  if (rateLimitDisabled()) {
    const { value } = await db.$transaction((tx) => write(tx));
    return { allowed: true, value, remaining: 999 };
  }
  const freshExpiry = new Date(now.getTime() + windowMs);
  try {
    return await db.$transaction(async (tx) => {
      // Open or restart the window and lock its row until the write is charged.
      const [row] = await tx.$queryRaw<{ count: number; expiresAt: Date }[]>`
        INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt", "createdAt")
        VALUES (${key}, 0, ${freshExpiry}, ${now})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
            THEN 0 ELSE "AuthRateLimit"."count" END,
          "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now}
            THEN ${freshExpiry} ELSE "AuthRateLimit"."expiresAt" END
        RETURNING "count", "expiresAt"`;
      if (!row) throw new Error('meteredWrite: upsert returned no row');
      const used = Number(row.count);
      const { written, value } = await write(tx);
      if (!Number.isInteger(written) || written < 0) {
        throw new Error(`meteredWrite: bad written count ${written}`);
      }
      if (written > 0 && used + written > limit) throw new OverBudget(new Date(row.expiresAt));
      if (written > 0) {
        await tx.$executeRaw`
          UPDATE "AuthRateLimit" SET "count" = "count" + ${written} WHERE "key" = ${key}`;
      }
      return { allowed: true, value, remaining: Math.max(0, limit - used - written) } as const;
    });
  } catch (err) {
    if (err instanceof OverBudget) return { allowed: false, resetAt: err.resetAt };
    throw err;
  }
}
