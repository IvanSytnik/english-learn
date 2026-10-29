import { localDayStartMs } from '../vocab/day';
import { summarizeVocab, type VocabSummary } from '../vocab/overview';
import { selectVocab, type VocabSelection } from '../vocab/select';
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
  /** Words just shown, so a just-failed word is not served straight back. */
  excludeItemIds?: readonly string[];
  /**
   * A topic session: only this concept's words are served. The daily
   * new-word limit stays the learner's, across topics.
   */
  conceptId?: string;
};

/** The `/words` overview: the summary plus today's new-word allowance. */
export type VocabOverview = VocabSummary & {
  newToday: number;
  dailyLimit: number;
  remainingNew: number;
};

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
      const [candidates, newToday, profile] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.countNewVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
      ]);
      return {
        ...summarizeVocab(candidates, nowMs),
        newToday,
        dailyLimit: profile.dailyLimit,
        remainingNew: Math.max(0, profile.dailyLimit - newToday),
      };
    },

    async nextVocab(input: NextVocabInput): Promise<VocabSelection> {
      const nowMs = input.nowMs ?? Date.now();
      const dayStart = localDayStartMs(nowMs, input.timeZone);
      const [all, newToday, profile] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.countNewVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
      ]);
      const candidates =
        input.conceptId === undefined ? all : all.filter((c) => c.conceptId === input.conceptId);
      return selectVocab({
        candidates,
        nowMs,
        newToday,
        dailyLimit: profile.dailyLimit,
        targetLevel: profile.assessedLevel,
        seed: `${input.userId}:${dayStart}`,
        excludeItemIds: input.excludeItemIds,
      });
    },
  };
}

export type VocabSessionService = ReturnType<typeof createVocabSessionService>;
