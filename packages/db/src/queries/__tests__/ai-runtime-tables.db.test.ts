import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { APP_FLAG_DEFAULTS } from '../../schemas/app-flag';
import { aiSpendSince, recordAiUsage } from '../ai-usage';
import { APP_FLAG_CACHE_TTL_MS, clearAppFlagCache, readAppFlag, setAppFlag } from '../app-flags';

/**
 * AppFlag and AiUsage (B6.9) against a real, migrated Postgres: the CHECKs,
 * the SET NULL on account deletion and the sums live in the DB. Same gate as
 * the other DB tests (DIAG_DB_TEST_URL; required in CI).
 *
 * AppFlag keys are global (a fixed set): the test owns them for its run and
 * deletes them afterwards — never point DIAG_DB_TEST_URL at a shared DB.
 * AiUsage rows carry this run's model name and are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the AI runtime DB test would be skipped');
}

const RUN = `test-ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const KEY = 'ai.daily_budget_micro_usd';

describe.skipIf(!url)('AppFlag (real Postgres)', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(url);
  });
  beforeEach(async () => {
    clearAppFlagCache();
    await db.appFlag.deleteMany({ where: { key: KEY } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.appFlag.deleteMany({ where: { key: KEY } });
    await db.$disconnect();
  });

  it('a missing row reads as the fail-closed default', async () => {
    expect(await readAppFlag(db, KEY)).toBe(APP_FLAG_DEFAULTS[KEY]);
    expect(await readAppFlag(db, 'ai.lexeme_generation.enabled')).toBe(false);
  });

  it('reads a set value', async () => {
    await setAppFlag(db, KEY, 2_000_000);
    expect(await readAppFlag(db, KEY)).toBe(2_000_000);
  });

  it('a stored value its schema rejects reads as the default', async () => {
    await db.appFlag.create({ data: { key: KEY, value: '2000000' } });
    expect(await readAppFlag(db, KEY)).toBe(0);
  });

  it('setAppFlag refuses an invalid value and writes nothing', async () => {
    await expect(setAppFlag(db, KEY, -1)).rejects.toThrow(/^setAppFlag: invalid value/);
    await expect(setAppFlag(db, KEY, 1.5)).rejects.toThrow(/^setAppFlag: invalid value/);
    expect(await db.appFlag.count({ where: { key: KEY } })).toBe(0);
  });

  it('caches for 60 s, then reads the DB again', async () => {
    const t0 = 1_000_000;
    await setAppFlag(db, KEY, 100);
    expect(await readAppFlag(db, KEY, { nowMs: t0 })).toBe(100);
    await db.appFlag.update({ where: { key: KEY }, data: { value: 200 } });
    expect(await readAppFlag(db, KEY, { nowMs: t0 + APP_FLAG_CACHE_TTL_MS - 1 })).toBe(100);
    expect(await readAppFlag(db, KEY, { nowMs: t0 + APP_FLAG_CACHE_TTL_MS })).toBe(200);
  });

  it('a DB error reads as the default and is not cached', async () => {
    const broken = {
      appFlag: {
        findUnique: () => Promise.reject(new Error('connection refused')),
      },
    } as unknown as PrismaClient;
    await setAppFlag(db, KEY, 300);
    clearAppFlagCache();
    expect(await readAppFlag(broken, KEY)).toBe(0);
    expect(await readAppFlag(db, KEY)).toBe(300);
  });

  it('the key CHECK refuses a key that is not dotted lowercase', async () => {
    await expect(
      db.appFlag.create({ data: { key: `Bad Key ${RUN}`, value: true } }),
    ).rejects.toThrow(/AppFlag_key_shape/);
  });
});

describe.skipIf(!url)('AiUsage (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];
  const row = (over: Partial<Parameters<typeof recordAiUsage>[1]> = {}) =>
    ({
      feature: 'lexeme_generation',
      model: RUN,
      userId: null,
      inputTokens: 100,
      outputTokens: 50,
      cacheRead: 0,
      cacheWrite: 0,
      costMicroUsd: 10,
      latencyMs: 5,
      ok: true,
      ...over,
    }) as Parameters<typeof recordAiUsage>[1];
  const newUser = async () => {
    const user = await db.user.create({ data: { email: `${RUN}-${userIds.length}@test.local` } });
    userIds.push(user.id);
    return user.id;
  };

  beforeAll(() => {
    db = createPrismaClient(url);
  });
  afterAll(async () => {
    if (!db) return;
    await db.aiUsage.deleteMany({ where: { model: RUN } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('sums cost since a moment, globally and per user; failed calls count', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const since = new Date();
    await db.aiUsage.create({
      data: {
        ...row({ userId: a, costMicroUsd: 1_000 }),
        createdAt: new Date(since.getTime() - 1),
      },
    });
    await recordAiUsage(db, row({ userId: a, costMicroUsd: 7 }));
    await recordAiUsage(db, row({ userId: a, costMicroUsd: 5, ok: false, errorCode: 'timeout' }));
    await recordAiUsage(db, row({ userId: b, costMicroUsd: 11 }));

    expect(await aiSpendSince(db, { since, userId: a })).toBe(12);
    expect(await aiSpendSince(db, { since, userId: b })).toBe(11);
    expect(await aiSpendSince(db, { since: new Date(since.getTime() - 1), userId: a })).toBe(1_012);
    expect(await aiSpendSince(db, { since })).toBeGreaterThanOrEqual(23);
    expect(await aiSpendSince(db, { since: new Date(Date.now() + 60_000) })).toBe(0);
  });

  it('deleting the user keeps the cost row and clears userId', async () => {
    const id = await newUser();
    await recordAiUsage(db, row({ userId: id, costMicroUsd: 3 }));
    await db.user.delete({ where: { id } });
    const rows = await db.aiUsage.findMany({ where: { model: RUN, costMicroUsd: 3 } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
  });

  it('CHECKs refuse negative counts, a free-text feature and ok/errorCode mismatches', async () => {
    const bad = [
      { ...row(), outputTokens: -1 },
      { ...row(), feature: 'Lexeme Gen' },
      { ...row(), ok: false, errorCode: null },
      { ...row(), ok: true, errorCode: 'timeout' },
    ];
    for (const data of bad) {
      await expect(db.aiUsage.create({ data })).rejects.toThrow(/AiUsage_/);
    }
  });
});
