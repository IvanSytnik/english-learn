import type { StageValue } from '@englishlearn/ui';
import { type ExerciseFeedback, type Review, STAGE_RANK, type Verdict } from './view';

/**
 * Session summary, built on the client from the feedback the player already
 * received — no extra server request.
 *
 * A SessionEntry holds only what the summary shows: no answer, no key, no
 * prompt. The answer was revealed in the inline feedback; the summary is
 * about progress, not about re-showing items.
 */
export type SessionEntry = {
  conceptTitle: string;
  verdict: Verdict;
  /** Stage announced after this answer (Developing and up), or null. */
  crossed: StageValue | null;
  review: Review;
};

export type SessionSummary = {
  answered: number;
  correct: number;
  incorrect: number;
  dontKnow: number;
  /** Highest stage each concept reached this session, in order of first crossing. */
  stageUps: { concept: string; stage: StageValue }[];
  /** Concepts whose last answer put them on a learning step. */
  backSoon: string[];
  /** Other concepts grouped by days until review, nearest first. */
  backLater: { days: number; concepts: string[] }[];
};

/** Pick exactly the summary fields from one feedback — nothing else crosses. */
export function toSessionEntry(conceptTitle: string, feedback: ExerciseFeedback): SessionEntry {
  return {
    conceptTitle,
    verdict: feedback.verdict,
    crossed: feedback.consequence.kind === 'stageCrossed' ? feedback.consequence.stage : null,
    review: feedback.review,
  };
}

export function summarizeSession(entries: readonly SessionEntry[]): SessionSummary {
  const stageUps = new Map<string, StageValue>();
  // The concept's last answer decides when it comes back: that is the FSRS
  // state the learner leaves the session with.
  const lastReview = new Map<string, Review>();

  for (const entry of entries) {
    if (entry.crossed) {
      const before = stageUps.get(entry.conceptTitle);
      if (!before || STAGE_RANK[entry.crossed] > STAGE_RANK[before]) {
        stageUps.set(entry.conceptTitle, entry.crossed);
      }
    }
    lastReview.set(entry.conceptTitle, entry.review);
  }

  const backSoon: string[] = [];
  const later = new Map<number, string[]>();
  for (const [concept, review] of lastReview) {
    if (review.kind === 'backSoon') backSoon.push(concept);
    else later.set(review.days, [...(later.get(review.days) ?? []), concept]);
  }

  const count = (verdict: Verdict) => entries.filter((e) => e.verdict === verdict).length;
  return {
    answered: entries.length,
    correct: count('correct'),
    incorrect: count('incorrect'),
    dontKnow: count('dontKnow'),
    stageUps: [...stageUps].map(([concept, stage]) => ({ concept, stage })),
    backSoon,
    backLater: [...later].sort(([a], [b]) => a - b).map(([days, concepts]) => ({ days, concepts })),
  };
}
