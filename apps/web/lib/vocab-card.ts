import type { StageCounts } from '@englishlearn/learner-model';
import type { VocabOverviewView } from './vocab-overview';

/**
 * The dashboard's vocabulary card (B2.8): the `/words` overview's aggregates
 * only. Built field by field (a whitelist, like the rest of the dashboard):
 * no topic list — it would bloat the dashboard's payload — and no FSRS
 * number. Shared by the server loader and the client refresh, so both hand
 * the card the same shape.
 */

export type DashboardVocab = {
  totalWords: number;
  dueNow: number;
  newToday: number;
  dailyLimit: number;
  remainingNew: number;
  stages: StageCounts;
};

export function toDashboardVocab(v: VocabOverviewView): DashboardVocab {
  return {
    totalWords: v.totalWords,
    dueNow: v.dueNow,
    newToday: v.newToday,
    dailyLimit: v.dailyLimit,
    remainingNew: v.remainingNew,
    stages: {
      new: v.stages.new,
      learning: v.stages.learning,
      familiar: v.stages.familiar,
      known: v.stages.known,
      mastered: v.stages.mastered,
    },
  };
}

export type VocabCardCta = { kind: 'review'; count: number } | { kind: 'learn' } | { kind: 'open' };

/** Reviews first, then today's new words; with neither, the overview. */
export function vocabCardCta(v: Pick<DashboardVocab, 'dueNow' | 'remainingNew'>): VocabCardCta {
  if (v.dueNow > 0) return { kind: 'review', count: v.dueNow };
  return v.remainingNew > 0 ? { kind: 'learn' } : { kind: 'open' };
}
