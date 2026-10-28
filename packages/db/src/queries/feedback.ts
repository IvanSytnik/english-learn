import type { BetaFeedback, Prisma, PrismaClient } from '../generated/client/client';
import type { CreateBetaFeedback } from '../schemas';

/** Already validated by `CreateBetaFeedbackSchema`, plus the session's user. */
export type CreateBetaFeedbackData = CreateBetaFeedback & { userId: string };

/**
 * Store one beta feedback report. Missing optional fields are stored as SQL
 * NULL (a `null` metadata too — never a JSON `null`).
 */
export async function createBetaFeedback(
  db: Pick<PrismaClient, 'betaFeedback'>,
  data: CreateBetaFeedbackData,
): Promise<BetaFeedback> {
  return db.betaFeedback.create({
    data: {
      userId: data.userId,
      kind: data.kind,
      text: data.text,
      url: data.url,
      itemId: data.itemId ?? null,
      conceptId: data.conceptId ?? null,
      metadata: (data.metadata ?? undefined) as Prisma.InputJsonObject | undefined,
    },
  });
}

export const BETA_FEEDBACK_LIST_DEFAULT = 100;
export const BETA_FEEDBACK_LIST_MAX = 500;

/** One report for the admin list, with who sent it. */
export type BetaFeedbackListEntry = Pick<
  BetaFeedback,
  'id' | 'kind' | 'text' | 'url' | 'itemId' | 'conceptId' | 'createdAt'
> & { user: { email: string; name: string | null } };

/**
 * The newest reports first, for the admin list. Admin-only: callers must have
 * checked the role. `limit` is clamped to 1..500 (default 100); metadata is
 * left out of the list.
 */
export async function getBetaFeedbacks(
  db: Pick<PrismaClient, 'betaFeedback'>,
  { limit = BETA_FEEDBACK_LIST_DEFAULT }: { limit?: number } = {},
): Promise<BetaFeedbackListEntry[]> {
  const take = Number.isFinite(limit)
    ? Math.min(BETA_FEEDBACK_LIST_MAX, Math.max(1, Math.trunc(limit)))
    : BETA_FEEDBACK_LIST_DEFAULT;
  return db.betaFeedback.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      kind: true,
      text: true,
      url: true,
      itemId: true,
      conceptId: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });
}
