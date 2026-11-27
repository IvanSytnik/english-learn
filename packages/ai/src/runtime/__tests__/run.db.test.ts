import { createPrismaClient } from '@englishlearn/db/create-client';
import type { AppFlagKey, AppFlagValue } from '@englishlearn/db/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { costMicroUsd, estimateInputTokens, worstCaseCostMicroUsd } from '../prices';
import type { AiProvider, AiRequest, ProviderResult } from '../provider';
import { type AiRuntimeDeps, type FlagReader, runAiCall, startOfUtcDay } from '../run';

/**
 * runAiCall against a real, migrated Postgres (B6.9): the kill switch, the
 * global budget and the per-user budget are decided from AiUsage sums, and
 * every call that reached the provider leaves exactly one row.
 *
 * Isolation from the other DB tests running at the same time (CI runs every
 * package's tests in parallel on one database): the runtime clock is a day
 * in the far future unique to this run, so the day's sums see only this
 * file's rows; flags are injected (AppFlag reading has its own DB test in
 * @englishlearn/db). Rows and users are deleted afterwards.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the AI runtime DB test would be skipped');
}

const RUN = `test-airun-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = new Date(Date.UTC(2100 + Math.floor(Math.random() * 800), 0, 1, 12));
const Out = z.object({ word: z.string() });

const REQUEST: AiRequest<z.infer<typeof Out>> = {
  model: 'claude-haiku-5-5',
  system: 'system prompt '.repeat(20),
  user: 'blorf',
  schema: Out,
  maxTokens: 1_000,
};
const WORST = worstCaseCostMicroUsd(
  'claude-haiku-5-5',
  estimateInputTokens(REQUEST.system, REQUEST.user),
  REQUEST.maxTokens,
);
const USAGE = { inputTokens: 300, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
const COST = costMicroUsd('claude-haiku-5-5', USAGE);

function fakeProvider(result: ProviderResult<unknown>): AiProvider & { calls: number } {
  const provider = {
    calls: 0,
    async call<T>(): Promise<ProviderResult<T>> {
      provider.calls += 1;
      return result as ProviderResult<T>;
    },
  };
  return provider;
}
const OK = fakeProvider({ ok: true, data: { word: 'x' }, usage: USAGE, latencyMs: 12 });

describe.skipIf(!url)('runAiCall (real Postgres)', () => {
  const db = url ? createPrismaClient(url) : (undefined as never);
  const userIds: string[] = [];
  let flags: { [K in AppFlagKey]: AppFlagValue<K> };
  const readFlag: FlagReader = async (key) => flags[key];
  const deps = (provider: AiProvider, over: Partial<AiRuntimeDeps> = {}): AiRuntimeDeps => ({
    db,
    provider,
    now: () => DAY,
    readFlag,
    ...over,
  });
  const call = (userId: string | null) => ({
    feature: 'lexeme_generation' as const,
    userId,
    request: REQUEST,
  });
  const rows = () =>
    db.aiUsage.findMany({
      where: { createdAt: { gte: startOfUtcDay(DAY) }, model: 'claude-haiku-5-5' },
      orderBy: { id: 'asc' },
    });
  const newUser = async () => {
    const user = await db.user.create({ data: { email: `${RUN}-${userIds.length}@test.local` } });
    userIds.push(user.id);
    return user.id;
  };

  beforeAll(async () => {
    // A day no other run shares (and no real data has).
    expect(await rows()).toEqual([]);
  });
  beforeEach(async () => {
    await db.aiUsage.deleteMany({ where: { createdAt: { gte: startOfUtcDay(DAY) } } });
    OK.calls = 0;
    flags = {
      'ai.lexeme_generation.enabled': true,
      'ai.daily_budget_micro_usd': 1_000_000,
      'ai.user_daily_budget_micro_usd': 1_000_000,
    };
  });
  afterAll(async () => {
    if (!url) return;
    await db.aiUsage.deleteMany({ where: { createdAt: { gte: startOfUtcDay(DAY) } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('an allowed call returns the data and writes one ok row with its tokens and cost', async () => {
    const userId = await newUser();
    const result = await runAiCall(deps(OK), call(userId));
    expect(result).toEqual({ ok: true, data: { word: 'x' }, costMicroUsd: COST });
    const written = await rows();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      feature: 'lexeme_generation',
      model: 'claude-haiku-5-5',
      userId,
      inputTokens: 300,
      outputTokens: 200,
      costMicroUsd: COST,
      latencyMs: 12,
      ok: true,
      errorCode: null,
      createdAt: DAY,
    });
  });

  it('kill switch off: refused before the provider, no row', async () => {
    flags['ai.lexeme_generation.enabled'] = false;
    expect(await runAiCall(deps(OK), call(null))).toEqual({
      ok: false,
      code: 'disabled',
      costMicroUsd: 0,
    });
    expect(OK.calls).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it('global budget: refused when today + the worst case would pass the cap', async () => {
    flags['ai.daily_budget_micro_usd'] = COST + WORST - 1;
    expect(await runAiCall(deps(OK), call(null))).toMatchObject({ ok: true });
    expect(await runAiCall(deps(OK), call(null))).toEqual({
      ok: false,
      code: 'budget_exceeded',
      costMicroUsd: 0,
    });
    expect(OK.calls).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it('global budget: a call fits exactly at the cap; a zero budget refuses every call', async () => {
    flags['ai.daily_budget_micro_usd'] = WORST;
    expect(await runAiCall(deps(OK), call(null))).toMatchObject({ ok: true });
    await db.aiUsage.deleteMany({ where: { createdAt: { gte: startOfUtcDay(DAY) } } });
    flags['ai.daily_budget_micro_usd'] = 0;
    expect(await runAiCall(deps(OK), call(null))).toMatchObject({ code: 'budget_exceeded' });
  });

  it('global budget counts every user; the per-user budget counts only that user', async () => {
    const [a, b] = [await newUser(), await newUser()];
    flags['ai.user_daily_budget_micro_usd'] = COST + WORST - 1;
    expect(await runAiCall(deps(OK), call(a))).toMatchObject({ ok: true });
    expect(await runAiCall(deps(OK), call(a))).toEqual({
      ok: false,
      code: 'user_cap',
      costMicroUsd: 0,
    });
    expect(await runAiCall(deps(OK), call(b))).toMatchObject({ ok: true });
    // A call for no user is not held by anyone's cap.
    expect(await runAiCall(deps(OK), call(null))).toMatchObject({ ok: true });
    expect(OK.calls).toBe(3);

    flags['ai.daily_budget_micro_usd'] = 3 * COST + WORST - 1;
    expect(await runAiCall(deps(OK), call(await newUser()))).toMatchObject({
      code: 'budget_exceeded',
    });
  });

  it("yesterday's spend does not count today", async () => {
    flags['ai.daily_budget_micro_usd'] = COST + WORST - 1;
    const yesterday = new Date(DAY.getTime() - 86_400_000);
    await db.aiUsage.create({
      data: {
        feature: 'lexeme_generation',
        model: 'claude-haiku-5-5',
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 999_999,
        latencyMs: 0,
        ok: true,
        createdAt: yesterday,
      },
    });
    try {
      expect(await runAiCall(deps(OK), call(null))).toMatchObject({ ok: true });
    } finally {
      await db.aiUsage.deleteMany({ where: { createdAt: yesterday } });
    }
  });

  it('a failed call with tokens books its actual cost; one without books the worst case', async () => {
    const invalid = fakeProvider({
      ok: false,
      code: 'invalid_output',
      message: 'bad',
      usage: USAGE,
      latencyMs: 5,
    });
    const timeout = fakeProvider({
      ok: false,
      code: 'timeout',
      message: 'deadline reached',
      usage: null,
      latencyMs: 20_000,
    });
    expect(await runAiCall(deps(invalid), call(null))).toEqual({
      ok: false,
      code: 'invalid_output',
      message: 'bad',
      costMicroUsd: COST,
    });
    expect(await runAiCall(deps(timeout), call(null))).toEqual({
      ok: false,
      code: 'timeout',
      message: 'deadline reached',
      costMicroUsd: WORST,
    });
    const written = await rows();
    expect(written.map((r) => [r.ok, r.errorCode, r.costMicroUsd, r.inputTokens])).toEqual(
      expect.arrayContaining([
        [false, 'invalid_output', COST, 300],
        [false, 'timeout', WORST, 0],
      ]),
    );
  });

  it('an AiUsage write failure does not lose the result', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      appFlag: db.appFlag,
      aiUsage: {
        aggregate: db.aiUsage.aggregate.bind(db.aiUsage),
        create: () => Promise.reject(new Error('connection lost')),
      },
    } as unknown as AiRuntimeDeps['db'];
    try {
      expect(await runAiCall(deps(OK, { db: broken }), call(null))).toMatchObject({ ok: true });
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('AiUsage write failed'),
        expect.any(Error),
      );
    } finally {
      error.mockRestore();
    }
  });
});
