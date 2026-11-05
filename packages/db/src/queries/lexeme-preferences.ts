import type { PrismaClient } from '../generated/client/client';
import { type LexemePreferenceStateValue, MAX_PREFERENCE_BATCH } from '../schemas/word-list';

/**
 * A learner's word preferences (B6.6): PRIORITIZED (first among new words)
 * or HIDDEN (out of every session tier, B6-SPEC V2-13). Mutable data that
 * steers selection only — never an event, never a projection; un-hiding a
 * word brings it back with its whole history.
 *
 * One row per user and word (`@@id([userId, lexemeId])`): prioritizing a
 * hidden word unhides it, hiding a prioritized one drops the priority.
 */

type PreferenceDb = Pick<PrismaClient, '$queryRaw'>;

/**
 * Put each word in `state` for the user, as one statement. Only PUBLISHED
 * lexemes are written — any other id (unknown, draft, unpublished since the
 * caller looked) is returned in `notFound` and nothing is written for it. A
 * row already in that state is left alone, so a repeat writes 0 (`changed`).
 */
export async function setLexemePreferences(
  db: PreferenceDb,
  args: { userId: string; lexemeIds: readonly string[]; state: LexemePreferenceStateValue },
): Promise<{ changed: number; notFound: string[] }> {
  const ids = [...new Set(args.lexemeIds)];
  if (ids.length > MAX_PREFERENCE_BATCH) {
    throw new Error(`setLexemePreferences: ${ids.length} words, at most ${MAX_PREFERENCE_BATCH}`);
  }
  if (ids.length === 0) return { changed: 0, notFound: [] };
  const [row] = await db.$queryRaw<{ found: string[] | null; changed: number }[]>`
    WITH target AS (
      SELECT l."id" FROM "Lexeme" l
      WHERE l."id" = ANY(${ids}::text[]) AND l."status" = 'PUBLISHED'
    ), written AS (
      INSERT INTO "StudentLexemePreference" ("userId", "lexemeId", "state", "updatedAt")
      SELECT ${args.userId}, t."id", ${args.state}::"LexemePreferenceState", now() FROM target t
      ON CONFLICT ("userId", "lexemeId") DO UPDATE
        SET "state" = EXCLUDED."state", "updatedAt" = EXCLUDED."updatedAt"
        WHERE "StudentLexemePreference"."state" <> EXCLUDED."state"
      RETURNING 1
    )
    SELECT (SELECT array_agg("id") FROM target) AS found,
           (SELECT count(*) FROM written)::int AS changed`;
  const found = new Set(row?.found ?? []);
  return { changed: row?.changed ?? 0, notFound: ids.filter((id) => !found.has(id)) };
}

/**
 * Drop the preference where it is `state` (unprioritize / unhide). A word in
 * the other state keeps it: unprioritizing a hidden word does not unhide it.
 * Any lexeme status — clearing is always allowed.
 */
export async function clearLexemePreferences(
  db: PreferenceDb,
  args: { userId: string; lexemeIds: readonly string[]; state: LexemePreferenceStateValue },
): Promise<{ cleared: number }> {
  const ids = [...new Set(args.lexemeIds)];
  if (ids.length > MAX_PREFERENCE_BATCH) {
    throw new Error(`clearLexemePreferences: ${ids.length} words, at most ${MAX_PREFERENCE_BATCH}`);
  }
  if (ids.length === 0) return { cleared: 0 };
  const [row] = await db.$queryRaw<{ cleared: number }[]>`
    WITH gone AS (
      DELETE FROM "StudentLexemePreference"
      WHERE "userId" = ${args.userId}
        AND "lexemeId" = ANY(${ids}::text[])
        AND "state" = ${args.state}::"LexemePreferenceState"
      RETURNING 1
    )
    SELECT count(*)::int AS cleared FROM gone`;
  return { cleared: row?.cleared ?? 0 };
}

export type VocabPreferenceRow = {
  lexemeId: string;
  /** The word's VOCAB_WORD item (the session selects items); null if it has none. */
  itemId: string | null;
  state: LexemePreferenceStateValue;
};

/**
 * Every preference of the learner, with the word's item — one query for both
 * the session (item ids) and the browsing pages (lexeme ids).
 */
export async function getVocabPreferences(
  db: PreferenceDb,
  userId: string,
): Promise<VocabPreferenceRow[]> {
  return db.$queryRaw<VocabPreferenceRow[]>`
    SELECT p."lexemeId", i."id" AS "itemId", p."state"::text AS "state"
    FROM "StudentLexemePreference" p
    LEFT JOIN "Item" i ON i."lexemeId" = p."lexemeId" AND i."kind" = 'VOCAB_WORD'
    WHERE p."userId" = ${userId}
    ORDER BY p."lexemeId"`;
}
