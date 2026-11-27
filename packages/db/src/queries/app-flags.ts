import type { Prisma, PrismaClient } from '../generated/client/client';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_SCHEMAS,
  type AppFlagKey,
  type AppFlagValue,
} from '../schemas/app-flag';

/**
 * Runtime switches (B6.9): read with a 60 s in-process cache, so flipping a
 * flag in the DB takes effect within a minute on every warm instance, with
 * no redeploy.
 *
 * Fail closed: a missing row, a value its schema rejects, or a DB error
 * reads as `APP_FLAG_DEFAULTS` (AI off, zero budget). A DB error is not
 * cached — the next read tries again.
 */

export const APP_FLAG_CACHE_TTL_MS = 60_000;

type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<AppFlagKey, CacheEntry>();

/** Tests and `setAppFlag` only. */
export function clearAppFlagCache(): void {
  cache.clear();
}

function parseFlag<K extends AppFlagKey>(key: K, raw: unknown): AppFlagValue<K> | undefined {
  const parsed = APP_FLAG_SCHEMAS[key].safeParse(raw);
  return parsed.success ? (parsed.data as AppFlagValue<K>) : undefined;
}

export async function readAppFlag<K extends AppFlagKey>(
  db: Pick<PrismaClient, 'appFlag'>,
  key: K,
  options: { nowMs?: number } = {},
): Promise<AppFlagValue<K>> {
  const now = options.nowMs ?? Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as AppFlagValue<K>;

  let value: AppFlagValue<K>;
  try {
    const row = await db.appFlag.findUnique({ where: { key }, select: { value: true } });
    const parsed = row ? parseFlag(key, row.value) : undefined;
    if (row && parsed === undefined) {
      console.error(`[app-flag] ${key}: stored value is invalid, reading the default`);
    }
    value = parsed ?? APP_FLAG_DEFAULTS[key];
  } catch (error) {
    console.error(`[app-flag] ${key}: read failed, reading the default`, error);
    return APP_FLAG_DEFAULTS[key];
  }
  cache.set(key, { value, expiresAt: now + APP_FLAG_CACHE_TTL_MS });
  return value;
}

/** Validated write (the `ai:flag` script). Drops this process's cached value. */
export async function setAppFlag<K extends AppFlagKey>(
  db: Pick<PrismaClient, 'appFlag'>,
  key: K,
  value: unknown,
): Promise<AppFlagValue<K>> {
  const parsed = parseFlag(key, value);
  if (parsed === undefined) {
    throw new Error(`setAppFlag: invalid value for ${key}: ${JSON.stringify(value)}`);
  }
  const json = parsed as Prisma.InputJsonValue;
  await db.appFlag.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
  cache.delete(key);
  return parsed;
}

export type AppFlagRow = { key: string; value: unknown; updatedAt: Date };

/** Every stored row, known key or not (the `ai:flag` script's `list`). */
export async function listAppFlags(db: Pick<PrismaClient, 'appFlag'>): Promise<AppFlagRow[]> {
  return db.appFlag.findMany({ orderBy: { key: 'asc' } });
}
