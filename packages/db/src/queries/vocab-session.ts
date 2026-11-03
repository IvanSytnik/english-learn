import type { PrismaClient } from '../generated/client/client';
import { DailyVocabLimitSchema } from '../schemas/daily-vocab-limit';
import { ensureStudentProfile } from './student-profile';

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
 * Store the learner's daily new-word limit. Validated here (an integer in
 * 1..50, the CHECK's range) before anything is written — anything else
 * throws and leaves the profile untouched. A missing profile is created
 * first, so this never fails with "record not found".
 */
export async function setDailyVocabLimit(
  db: Pick<PrismaClient, 'studentProfile'>,
  userId: string,
  limit: number,
): Promise<void> {
  const dailyVocabLimit = DailyVocabLimitSchema.parse(limit);
  await ensureStudentProfile(db, userId);
  await db.studentProfile.update({ where: { userId }, data: { dailyVocabLimit } });
}

/**
 * Vocabulary words the learner met for the first time at or after `sinceMs`
 * (the start of their local day): lexeme-backed items whose FIRST
 * ITEM_ATTEMPTED falls in the window.
 *
 * - `count` leaves out a passed proof — a word proven known (`proof: true`,
 *   EASY, +8 d) creates no short-term review debt. A failed proof is an
 *   ordinary first attempt and counts. This is the daily new-word limit.
 * - `lemmaKeys` — the distinct Lexeme.lemmaKeys of all of those first
 *   attempts, passed proofs included (B6.2a homograph spread: after `go`
 *   verb today, `go` noun waits for another day). Same scan, one round trip.
 *
 * Today's events come from the (userId, type, occurredAt) index; the
 * "no earlier attempt" check walks the same index below each candidate.
 */
export async function newVocabWordsSince(
  db: Pick<PrismaClient, '$queryRaw'>,
  args: { userId: string; sinceMs: number },
): Promise<{ count: number; lemmaKeys: string[] }> {
  const since = BigInt(Math.floor(args.sinceMs));
  const [row] = await db.$queryRaw<{ n: number; keys: string[] }[]>`
    SELECT
      (count(*) FILTER (
        WHERE NOT COALESCE((e."payload"->>'proof')::boolean, false)
      ))::int AS n,
      COALESCE(
        array_agg(DISTINCT l."lemmaKey" ORDER BY l."lemmaKey"),
        ARRAY[]::text[]
      ) AS keys
    FROM "LearnerEvent" e
    JOIN "Item" i ON i."id" = e."payload"->>'itemId'
      AND i."kind" = 'VOCAB_WORD' AND i."lexemeId" IS NOT NULL
    JOIN "Lexeme" l ON l."id" = i."lexemeId"
    WHERE e."userId" = ${args.userId}
      AND e."type" = 'ITEM_ATTEMPTED'
      AND e."occurredAt" >= ${since}
      AND NOT EXISTS (
        SELECT 1 FROM "LearnerEvent" p
        WHERE p."userId" = ${args.userId}
          AND p."type" = 'ITEM_ATTEMPTED'
          AND p."payload"->>'itemId' = e."payload"->>'itemId'
          AND (p."occurredAt", p."id") < (e."occurredAt", e."id")
      )`;
  return { count: row?.n ?? 0, lemmaKeys: row?.keys ?? [] };
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
