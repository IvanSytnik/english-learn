import type { PrismaClient } from '../generated/client/client';

/**
 * Reads behind the daily new-word limit (B2.5). Learner state is never read
 * from ItemReviewState.createdAt — replay deletes and recreates those rows —
 * only from the event log.
 */

/** StudentProfile.dailyVocabLimit's column default (no profile yet). */
export const DEFAULT_DAILY_VOCAB_LIMIT = 10;

export async function getDailyVocabLimit(
  db: Pick<PrismaClient, 'studentProfile'>,
  userId: string,
): Promise<number> {
  const profile = await db.studentProfile.findUnique({
    where: { userId },
    select: { dailyVocabLimit: true },
  });
  return profile?.dailyVocabLimit ?? DEFAULT_DAILY_VOCAB_LIMIT;
}

/**
 * Vocabulary words the learner met for the first time at or after `sinceMs`
 * (the start of their local day): lexeme-backed items whose FIRST
 * ITEM_ATTEMPTED falls in the window and is not a passed proof — a word
 * proven known (`proof: true`, EASY, +8 d) creates no short-term review debt.
 * A failed proof is an ordinary first attempt and counts.
 *
 * Today's events come from the (userId, type, occurredAt) index; the
 * "no earlier attempt" check walks the same index below each candidate.
 */
export async function countNewVocabWordsSince(
  db: Pick<PrismaClient, '$queryRaw'>,
  args: { userId: string; sinceMs: number },
): Promise<number> {
  const since = BigInt(Math.floor(args.sinceMs));
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "LearnerEvent" e
    JOIN "Item" i ON i."id" = e."payload"->>'itemId'
      AND i."kind" = 'VOCAB_WORD' AND i."lexemeId" IS NOT NULL
    WHERE e."userId" = ${args.userId}
      AND e."type" = 'ITEM_ATTEMPTED'
      AND e."occurredAt" >= ${since}
      AND NOT COALESCE((e."payload"->>'proof')::boolean, false)
      AND NOT EXISTS (
        SELECT 1 FROM "LearnerEvent" p
        WHERE p."userId" = ${args.userId}
          AND p."type" = 'ITEM_ATTEMPTED'
          AND p."payload"->>'itemId' = e."payload"->>'itemId'
          AND (p."occurredAt", p."id") < (e."occurredAt", e."id")
      )`;
  return row?.n ?? 0;
}

/**
 * Whether the learner has answered this word before (an ItemReviewState row
 * exists). A "Know -> prove" check is offered only for a word that has none;
 * the write path re-checks it under the user lock.
 */
export async function hasItemReviewState(
  db: Pick<PrismaClient, 'itemReviewState'>,
  args: { userId: string; itemId: string },
): Promise<boolean> {
  const row = await db.itemReviewState.findUnique({
    where: { userId_itemId: { userId: args.userId, itemId: args.itemId } },
    select: { id: true },
  });
  return row !== null;
}
