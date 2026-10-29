import type { Verdict } from '@/lib/exercise/view';

/**
 * End of a vocabulary session, from the session's own feedback — nothing is
 * fetched. `proven` counts words passed with "I know this word"; they are
 * also correct answers.
 */

export type VocabSessionEntry = { verdict: Verdict; proven: boolean };

export type VocabSessionSummary = {
  answered: number;
  correct: number;
  /** Wrong or "I don't know": back soon for another try. */
  again: number;
  proven: number;
};

export function summarizeVocabSession(entries: readonly VocabSessionEntry[]): VocabSessionSummary {
  return {
    answered: entries.length,
    correct: entries.filter((e) => e.verdict === 'correct').length,
    again: entries.filter((e) => e.verdict !== 'correct').length,
    proven: entries.filter((e) => e.proven).length,
  };
}
