import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { consumeRateLimit, meteredWrite } from '../rate-limit';

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

  it('a call of cost n counts n hits: 300 per hour as 200 + 100, then refused (B6.6)', async () => {
    const key = newKey();
    const hit = (cost: number) =>
      consumeRateLimit(db, { key, limit: 300, windowMs: 60 * MINUTE, cost, now: T0 });
    expect(await hit(200)).toMatchObject({ allowed: true, remaining: 100 });
    expect(await hit(100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await hit(1)).toMatchObject({ allowed: false, remaining: 0 });
    const fresh = newKey();
    expect(
      await consumeRateLimit(db, { key: fresh, limit: 300, windowMs: MINUTE, cost: 301, now: T0 }),
    ).toMatchObject({ allowed: false });
    await expect(
      consumeRateLimit(db, { key: fresh, limit: 3, windowMs: MINUTE, cost: 0, now: T0 }),
    ).rejects.toThrow(/bad cost/);
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

/**
 * meteredWrite (B6.7, HANDOFF #30): the key is charged the rows a write
 * actually wrote, in the write's own transaction. The "data" each test writes
 * is a marker row in the same table, so a rollback is visible.
 */
describe.skipIf(!url)('meteredWrite (real Postgres)', () => {
  let db: PrismaClient;
  let n = 0;
  const newKey = () => `${RUN}:m${n++}`;
  const HOUR = 60 * MINUTE;

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.authRateLimit.deleteMany({ where: { key: { startsWith: RUN } } });
    await db.$disconnect();
  });

  let call = 0;
  /** A write of `rows` new marker rows (`<key>:data:<call>:<i>`), one statement. */
  const writeRows = (key: string, rows: number, now = T0) => {
    const prefix = `${key}:data:${call++}`;
    return meteredWrite(db, { key, limit: 300, windowMs: HOUR, now }, async (tx) => {
      const { count } = await tx.authRateLimit.createMany({
        data: Array.from({ length: rows }, (_, i) => ({
          key: `${prefix}:${i}`,
          count: 1,
          expiresAt: T0,
        })),
      });
      return { written: count, value: count };
    });
  };
  const used = async (key: string) =>
    (await db.authRateLimit.findUnique({ where: { key } }))?.count ?? null;
  const markers = (key: string) =>
    db.authRateLimit.count({ where: { key: { startsWith: `${key}:data:` } } });

  it('charges exactly the rows written: 200 + 100 fit 300', async () => {
    const key = newKey();
    expect(await writeRows(key, 200)).toEqual({ allowed: true, value: 200, remaining: 100 });
    expect(await writeRows(key, 100)).toEqual({ allowed: true, value: 100, remaining: 0 });
    expect(await used(key)).toBe(300);
  });

  it('a write past the budget is rolled back and costs nothing', async () => {
    const key = newKey();
    await writeRows(key, 250);
    const refused = await writeRows(key, 51);
    expect(refused).toEqual({ allowed: false, resetAt: new Date(T0.getTime() + HOUR) });
    expect(await used(key)).toBe(250);
    // None of the refused write's rows was kept.
    expect(await markers(key)).toBe(250);
    // The rest of the budget is still there.
    expect(await writeRows(key, 50)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('a write of 0 rows costs nothing and is never refused, even at the limit', async () => {
    const key = newKey();
    expect(await writeRows(key, 0)).toEqual({ allowed: true, value: 0, remaining: 300 });
    expect(await used(key)).toBe(0);
    await writeRows(key, 300);
    expect(await writeRows(key, 0)).toEqual({ allowed: true, value: 0, remaining: 0 });
    expect(await writeRows(key, 1)).toMatchObject({ allowed: false });
    expect(await used(key)).toBe(300);
    // A window over the limit (consumeRateLimit counted refused hits in B6.6): still free.
    await db.authRateLimit.update({ where: { key }, data: { count: 301 } });
    expect(await writeRows(key, 0)).toEqual({ allowed: true, value: 0, remaining: 0 });
  });

  it('restarts with a fresh window after expiry', async () => {
    const key = newKey();
    await writeRows(key, 300);
    const atExpiry = new Date(T0.getTime() + HOUR);
    expect(await writeRows(key, 10, atExpiry)).toEqual({
      allowed: true,
      value: 10,
      remaining: 290,
    });
    const row = await db.authRateLimit.findUniqueOrThrow({ where: { key } });
    expect(row).toMatchObject({ count: 10, expiresAt: new Date(atExpiry.getTime() + HOUR) });
  });

  it('serializes concurrent writes of one key: never past the limit, nothing lost', async () => {
    const key = newKey();
    // An open window already: the lock, not the row's creation, has to serialize.
    await db.authRateLimit.create({
      data: { key, count: 0, expiresAt: new Date(T0.getTime() + HOUR) },
    });
    // Warm the pool, or "concurrent" transactions queue for connections (PITFALLS 212).
    await Promise.all(Array.from({ length: 10 }, () => db.$queryRaw`SELECT pg_sleep(0.05)::text`));
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        meteredWrite(db, { key, limit: 5, windowMs: HOUR, now: T0 }, async (tx) => {
          await tx.$queryRaw`SELECT pg_sleep(0.02)::text`;
          await tx.authRateLimit.create({
            data: { key: `${key}:data:${i}`, count: 1, expiresAt: T0 },
          });
          return { written: 1, value: i };
        }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(await used(key)).toBe(5);
    expect(await markers(key)).toBe(5);
  });

  it('refuses a bad written count', async () => {
    const key = newKey();
    await expect(
      meteredWrite(db, { key, limit: 3, windowMs: MINUTE, now: T0 }, async () => ({
        written: -1,
        value: null,
      })),
    ).rejects.toThrow(/bad written count/);
    expect(await used(key)).toBeNull();
  });
});
