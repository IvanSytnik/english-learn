import type { PrismaClient } from '@englishlearn/db';
import { aiSpendSince, recordAiUsage } from '@englishlearn/db/queries/ai-usage';
import { readAppFlag } from '@englishlearn/db/queries/app-flags';
import {
  AI_FEATURE_ENABLED_FLAG,
  type AiFeature,
  type AppFlagKey,
  type AppFlagValue,
} from '@englishlearn/db/schemas';
import { costMicroUsd, estimateInputTokens, worstCaseCostMicroUsd } from './prices';
import type { AiProvider, AiRequest, CallErrorCode, PreflightErrorCode } from './provider';

/**
 * The one way a request path calls an LLM (B6.9). In order:
 *
 *   1. kill switch `ai.<feature>.enabled` (AppFlag, fail closed) → `disabled`;
 *   2. global budget: today's (UTC) spend + this call's worst case must fit
 *      `ai.daily_budget_micro_usd` → `budget_exceeded`;
 *   3. per-user budget, when the call is for a user: their spend today +
 *      the worst case must fit `ai.user_daily_budget_micro_usd` → `user_cap`;
 *   4. the provider call;
 *   5. one AiUsage row for the call, ok or not — actual tokens and cost when a
 *      response arrived, the worst case when none did (the call may still have
 *      been billed).
 *
 * Refusals 1–3 write nothing and cost nothing. The budget is soft under
 * concurrency (decision 2026-11-25): calls that pass step 2 at the same time
 * can overshoot by at most their worst cases together; the API key's own
 * spend limit is the hard ceiling. Feature-level limits (≤ 20 words per
 * request, ≤ 50 per day) are the feature's own, on top of this.
 */

export type AiRuntimeDb = Pick<PrismaClient, 'appFlag' | 'aiUsage'>;

export type FlagReader = <K extends AppFlagKey>(key: K) => Promise<AppFlagValue<K>>;

export type AiRuntimeDeps = {
  db: AiRuntimeDb;
  provider: AiProvider;
  /** The clock of the budget day and of the AiUsage row's `createdAt`. */
  now?: () => Date;
  /** Defaults to `readAppFlag(db, …)` (60 s cache, fail closed); tests inject. */
  readFlag?: FlagReader;
};

export type AiCall<T> = {
  feature: AiFeature;
  /** The user the call is for; `null` for a call no user asked for. */
  userId: string | null;
  request: AiRequest<T>;
};

export type AiResult<T> =
  | { ok: true; data: T; costMicroUsd: number }
  | { ok: false; code: PreflightErrorCode; costMicroUsd: 0 }
  | { ok: false; code: CallErrorCode; message: string; costMicroUsd: number };

export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export async function runAiCall<T>(deps: AiRuntimeDeps, call: AiCall<T>): Promise<AiResult<T>> {
  const { db, provider } = deps;
  const { feature, userId, request } = call;
  const now = (deps.now ?? (() => new Date()))();
  const readFlag: FlagReader = deps.readFlag ?? ((key) => readAppFlag(db, key));
  const refuse = (code: PreflightErrorCode): AiResult<T> => ({ ok: false, code, costMicroUsd: 0 });

  if (!(await readFlag(AI_FEATURE_ENABLED_FLAG[feature]))) return refuse('disabled');

  const worstCase = worstCaseCostMicroUsd(
    request.model,
    estimateInputTokens(request.system, request.user),
    request.maxTokens,
  );
  const since = startOfUtcDay(now);
  const [budget, spent] = await Promise.all([
    readFlag('ai.daily_budget_micro_usd'),
    aiSpendSince(db, { since }),
  ]);
  if (spent + worstCase > budget) return refuse('budget_exceeded');

  if (userId !== null) {
    const [userBudget, userSpent] = await Promise.all([
      readFlag('ai.user_daily_budget_micro_usd'),
      aiSpendSince(db, { since, userId }),
    ]);
    if (userSpent + worstCase > userBudget) return refuse('user_cap');
  }

  const result = await provider.call(request);
  const usage = result.usage;
  const cost = usage ? costMicroUsd(request.model, usage) : worstCase;
  try {
    await recordAiUsage(db, {
      feature,
      model: request.model,
      userId,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheRead: usage?.cacheReadTokens ?? 0,
      cacheWrite: usage?.cacheWriteTokens ?? 0,
      costMicroUsd: cost,
      latencyMs: Math.max(0, Math.round(result.latencyMs)),
      createdAt: now,
      ...(result.ok ? { ok: true as const } : { ok: false as const, errorCode: result.code }),
    });
  } catch (error) {
    // The call happened; its result stands. The missing row under-counts
    // today's spend — loud, so it is noticed.
    console.error(`[ai-runtime] ${feature}: AiUsage write failed`, error);
  }

  if (result.ok) return { ok: true, data: result.data, costMicroUsd: cost };
  return { ok: false, code: result.code, message: result.message, costMicroUsd: cost };
}
