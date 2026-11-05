import type { CEFRLevel } from '../core/graph/types';
import { localDayStartMs } from '../vocab/day';
import { summarizeVocab, type VocabSummary } from '../vocab/overview';
import { selectVocab, type VocabScope, type VocabSelection } from '../vocab/select';
import type { VocabSessionDb } from './db-port';

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
   * A topic or collection session. Filters NEW words only: due reviews and
   * learning steps of every topic are still served first (B6-SPEC V2-5). The
   * daily new-word limit stays the learner's, across scopes.
   */
  scope?: VocabScope;
};

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

const NO_ITEMS: ReadonlySet<string> = new Set();

export function createVocabSessionService(db: VocabSessionDb) {
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
      const [candidates, { count: newToday }, profile] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.newVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
      ]);
      return {
        ...summarizeVocab(candidates, nowMs),
        newToday,
        dailyLimit: profile.dailyLimit,
        remainingNew: Math.max(0, profile.dailyLimit - newToday),
      };
    },

    async nextVocab(input: NextVocabInput): Promise<VocabNext> {
      const nowMs = input.nowMs ?? Date.now();
      const dayStart = localDayStartMs(nowMs, input.timeZone);
      const [candidates, today, profile] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.newVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
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
        scope: input.scope,
        // Learner preferences arrive with B6.6 (StudentLexemePreference).
        priorityItemIds: NO_ITEMS,
        hiddenItemIds: NO_ITEMS,
        recentConceptIds: recent.map((c) => c.conceptId),
        recentLemmaKeys: recent.map((c) => c.lemmaKey),
        todayNewLemmaKeys: new Set(today.lemmaKeys),
      });
      return { ...selection, learnerLevel: profile.assessedLevel };
    },
  };
}

export type VocabSessionService = ReturnType<typeof createVocabSessionService>;
