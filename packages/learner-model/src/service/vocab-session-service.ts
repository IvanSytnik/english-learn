import type { CEFRLevel } from '../core/graph/types';
import { localDayStartMs } from '../vocab/day';
import { summarizeVocab, type VocabSummary } from '../vocab/overview';
import { selectVocab, type VocabScope, type VocabSelection } from '../vocab/select';
import type { VocabCandidateRow, VocabSessionDb } from './db-port';

/**
 * VocabSessionService: "which word next?" for the vocabulary session (B2.5).
 * The read path of the vocab pool — symmetric to SelectionService for
 * grammar, read-only, no transaction. Writes go through
 * LearnerService.recordVocabOutcome.
 *
 * The daily new-word limit counts from the start of the learner's local day,
 * in the client's time zone (invalid → UTC).
 */

export type NextVocabInput = {
  userId: string;
  /** The client's IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). */
  timeZone: unknown;
  /** "now" as Unix ms. Tests pass it; prod omits -> Date.now(). */
  nowMs?: number;
  /**
   * Words just shown, oldest first (the decrypted recent refs): a just-failed
   * word is not served straight back, and their concepts drive the concept
   * spread of NEW words.
   */
  excludeItemIds?: readonly string[];
  /**
   * A topic, collection or list session. Filters NEW words only: due reviews
   * and learning steps of every topic are still served first (B6-SPEC V2-5).
   * The daily new-word limit stays the learner's, across scopes. A list is
   * named by id and resolved here for this learner: another user's, an
   * archived or an unknown list offers no new word (reviews still come).
   */
  scope?: VocabSessionScope;
};

/** A session scope as callers name it: a list by its id (B6.6). */
export type VocabSessionScope =
  | Exclude<VocabScope, { kind: 'list' }>
  | { kind: 'list'; listId: string };

/**
 * The selection, with the learner's assessed level (the diagnostic; null =
 * none): which variants of a rung the card may serve (B6.5).
 */
export type VocabNext = VocabSelection & { learnerLevel: CEFRLevel | null };

/** The `/words` overview: the summary plus today's new-word allowance. */
export type VocabOverview = VocabSummary & {
  newToday: number;
  dailyLimit: number;
  remainingNew: number;
};

/** Per word (item id): the learner's review state and preferences (B6.6). */
export type VocabWordStates = {
  /** Every published word; null = never answered. */
  reviews: ReadonlyMap<string, VocabCandidateRow['review']>;
  prioritizedItemIds: ReadonlySet<string>;
  hiddenItemIds: ReadonlySet<string>;
  /** Words with a passed "I know" proof (stage badge, V2-16). */
  provenItemIds: ReadonlySet<string>;
};

const NO_ITEMS: ReadonlySet<string> = new Set();

export function createVocabSessionService(db: VocabSessionDb) {
  /** The selector's scope: a list's item ids for its owner (one more read, list sessions only). */
  async function resolveScope(
    userId: string,
    scope: VocabSessionScope | undefined,
  ): Promise<VocabScope | undefined> {
    if (scope?.kind !== 'list') return scope;
    const itemIds = await db.getWordListItemIds(userId, scope.listId);
    return { kind: 'list', itemIds: itemIds === null ? NO_ITEMS : new Set(itemIds) };
  }

  return {
    /**
     * The learner's vocabulary at a glance — the same reads as nextVocab,
     * aggregated instead of selected (vocab/overview.ts).
     */
    async overview(input: {
      userId: string;
      timeZone: unknown;
      nowMs?: number;
    }): Promise<VocabOverview> {
      const nowMs = input.nowMs ?? Date.now();
      const dayStart = localDayStartMs(nowMs, input.timeZone);
      const [candidates, { count: newToday }, profile, preferences] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.newVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
        db.getVocabPreferences(input.userId),
      ]);
      return {
        // Hidden words (V2-13) are never due: the count agrees with the session.
        ...summarizeVocab(candidates, nowMs, new Set(preferences.hiddenItemIds)),
        newToday,
        dailyLimit: profile.dailyLimit,
        remainingNew: Math.max(0, profile.dailyLimit - newToday),
      };
    },

    /**
     * Today's new-word allowance left, without selecting: the question after
     * an intro card is served for its word, not chosen (B6.5).
     */
    async remainingNew(input: { userId: string; timeZone: unknown; nowMs?: number }) {
      const dayStart = localDayStartMs(input.nowMs ?? Date.now(), input.timeZone);
      const [{ count }, profile] = await Promise.all([
        db.newVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
      ]);
      return Math.max(0, profile.dailyLimit - count);
    },

    /**
     * Every word's state for this learner (B6.6 word pages and the bulk
     * "Prioritize this level"): its review state (null = never answered) and
     * the learner's preferences. The session's own reads, not selected.
     */
    async wordStates(userId: string): Promise<VocabWordStates> {
      const [candidates, preferences, proven] = await Promise.all([
        db.getVocabCandidates(userId),
        db.getVocabPreferences(userId),
        db.getProvenVocabItemIds(userId),
      ]);
      return {
        reviews: new Map(candidates.map((c) => [c.itemId, c.review])),
        prioritizedItemIds: new Set(preferences.prioritizedItemIds),
        hiddenItemIds: new Set(preferences.hiddenItemIds),
        provenItemIds: new Set(proven),
      };
    },

    async nextVocab(input: NextVocabInput): Promise<VocabNext> {
      const nowMs = input.nowMs ?? Date.now();
      const dayStart = localDayStartMs(nowMs, input.timeZone);
      const [candidates, today, profile, preferences, scope] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.newVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
        db.getVocabPreferences(input.userId),
        resolveScope(input.userId, input.scope),
      ]);
      const byId = new Map(candidates.map((c) => [c.itemId, c]));
      const recent = (input.excludeItemIds ?? []).flatMap((id) => {
        const c = byId.get(id);
        return c === undefined ? [] : [c];
      });
      const selection = selectVocab({
        candidates,
        nowMs,
        newToday: today.count,
        dailyLimit: profile.dailyLimit,
        targetLevel: profile.assessedLevel,
        seed: `${input.userId}:${dayStart}`,
        excludeItemIds: input.excludeItemIds,
        scope,
        priorityItemIds: new Set(preferences.prioritizedItemIds),
        hiddenItemIds: new Set(preferences.hiddenItemIds),
        recentConceptIds: recent.map((c) => c.conceptId),
        recentLemmaKeys: recent.map((c) => c.lemmaKey),
        todayNewLemmaKeys: new Set(today.lemmaKeys),
      });
      return { ...selection, learnerLevel: profile.assessedLevel };
    },
  };
}

export type VocabSessionService = ReturnType<typeof createVocabSessionService>;
