import { localDayStartMs } from '../vocab/day';
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
};

export function createVocabSessionService(db: VocabSessionDb) {
  return {
    async nextVocab(input: NextVocabInput): Promise<VocabSelection> {
      const nowMs = input.nowMs ?? Date.now();
      const dayStart = localDayStartMs(nowMs, input.timeZone);
      const [candidates, newToday, profile] = await Promise.all([
        db.getVocabCandidates(input.userId),
        db.countNewVocabSince(input.userId, dayStart),
        db.getVocabProfile(input.userId),
      ]);
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
