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
