import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { consumeRateLimit } from '../rate-limit';

/**
 * consumeRateLimit against a real, migrated Postgres: the atomicity lives in
 * the INSERT … ON CONFLICT, so a mock could not prove it. Same gate as the
 * other DB tests (DIAG_DB_TEST_URL; required in CI). Every key carries this
 * run's prefix and is deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the rate limit DB test would be skipped');
}

const RUN = `test-rl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const T0 = new Date('2026-10-29T12:00:00.000Z');
const MINUTE = 60_000;

describe.skipIf(!url)('consumeRateLimit (real Postgres)', () => {
  let db: PrismaClient;
  let n = 0;
  const newKey = () => `${RUN}:${n++}`;

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.authRateLimit.deleteMany({ where: { key: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('counts hits within the window and keeps its end', async () => {
    const key = newKey();
    const first = await consumeRateLimit(db, { key, limit: 3, windowMs: MINUTE, now: T0 });
    const later = new Date(T0.getTime() + 10_000);
    const second = await consumeRateLimit(db, { key, limit: 3, windowMs: MINUTE, now: later });

    expect(first).toEqual({
      allowed: true,
      remaining: 2,
      resetAt: new Date(T0.getTime() + MINUTE),
    });
    expect(second).toEqual({
      allowed: true,
      remaining: 1,
      resetAt: new Date(T0.getTime() + MINUTE),
    });
    const row = await db.authRateLimit.findUniqueOrThrow({ where: { key } });
    expect(row.count).toBe(2);
    expect(row.expiresAt).toEqual(new Date(T0.getTime() + MINUTE));
  });

  it('blocks once the limit is exceeded, and keeps blocking', async () => {
    const key = newKey();
    const hit = () => consumeRateLimit(db, { key, limit: 2, windowMs: MINUTE, now: T0 });
    const results = [await hit(), await hit(), await hit(), await hit()];

    expect(results.map((r) => r.allowed)).toEqual([true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([1, 0, 0, 0]);
    expect(results[3]?.resetAt).toEqual(new Date(T0.getTime() + MINUTE));
  });

  it('restarts the count with a fresh window after expiry', async () => {
    const key = newKey();
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(db, { key, limit: 2, windowMs: MINUTE, now: T0 });
    }
    const atExpiry = new Date(T0.getTime() + MINUTE);
    const after = await consumeRateLimit(db, { key, limit: 2, windowMs: MINUTE, now: atExpiry });

    expect(after).toEqual({
      allowed: true,
      remaining: 1,
      resetAt: new Date(atExpiry.getTime() + MINUTE),
    });
  });

  it('loses no increment under concurrent hits', async () => {
    const key = newKey();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeRateLimit(db, { key, limit: 5, windowMs: MINUTE, now: T0 }),
      ),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const row = await db.authRateLimit.findUniqueOrThrow({ where: { key } });
    expect(row.count).toBe(10);
  });

  it('keeps keys independent', async () => {
    const a = newKey();
    const b = newKey();
    await consumeRateLimit(db, { key: a, limit: 1, windowMs: MINUTE, now: T0 });
    const blockedA = await consumeRateLimit(db, { key: a, limit: 1, windowMs: MINUTE, now: T0 });
    const firstB = await consumeRateLimit(db, { key: b, limit: 1, windowMs: MINUTE, now: T0 });

    expect(blockedA.allowed).toBe(false);
    expect(firstB).toMatchObject({ allowed: true, remaining: 0 });
  });
});
