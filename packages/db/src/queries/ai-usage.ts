import type { PrismaClient } from '../generated/client/client';
import type { AiFeature } from '../schemas/app-flag';

/**
 * The AI runtime's cost log (B6.9). One row per call that reached the
 * provider, ok or not; the daily budget and the per-user cap are sums over
 * it. Only counts and cost — never prompt or output text.
 */

type AiUsageCounts = {
  feature: AiFeature;
  model: string;
  userId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number;
  latencyMs: number;
  /** The caller's clock (the runtime's budget day); the DB default otherwise. */
  createdAt?: Date;
};

/** `errorCode` iff the call failed (raw-SQL CHECK `AiUsage_error_code_iff_failed`). */
export type AiUsageRecord = AiUsageCounts &
  ({ ok: true; errorCode?: undefined } | { ok: false; errorCode: string });

export async function recordAiUsage(
  db: Pick<PrismaClient, 'aiUsage'>,
  record: AiUsageRecord,
): Promise<void> {
  await db.aiUsage.create({
    data: { ...record, errorCode: record.ok ? null : record.errorCode },
  });
}

/**
 * Total `costMicroUsd` of the rows created at or after `since` — all users,
 * or one user's when `userId` is given. Failed calls count: they were billed.
 */
export async function aiSpendSince(
  db: Pick<PrismaClient, 'aiUsage'>,
  { since, userId }: { since: Date; userId?: string },
): Promise<number> {
  const result = await db.aiUsage.aggregate({
    where: { createdAt: { gte: since }, ...(userId === undefined ? {} : { userId }) },
    _sum: { costMicroUsd: true },
  });
  return result._sum.costMicroUsd ?? 0;
}
