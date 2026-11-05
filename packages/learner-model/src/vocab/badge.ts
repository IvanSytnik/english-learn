import type { FsrsCardStatus } from '../core/fsrs/types';
import { LADDER_THRESHOLDS } from './ladder';

/**
 * The stage badge of a word on every browsing page (B6-SPEC V2-16): four
 * semantic stages by FSRS stability S — never the number itself (Axiom 4).
 * One pure function, so the topic, collection and list pages always agree.
 *
 *   not_started — never answered;
 *   learning    — S < 7 (below the cloze rung);
 *   reviewing   — 7 ≤ S < 60;
 *   known       — S ≥ 60 (the full-recall rung), or a passed "I know"
 *                 proof that has not lapsed since.
 *
 * The thresholds are the ladder's own (cloze and full-recall `ladderFrom`),
 * so a badge and the card the session serves move together.
 */

export const STAGE_BADGES = ['not_started', 'learning', 'reviewing', 'known'] as const;
export type StageBadge = (typeof STAGE_BADGES)[number];

/** Stability (days) from which a word is "reviewing": the cloze rung. */
export const REVIEWING_FROM = LADDER_THRESHOLDS.cloze;
/** Stability (days) from which a word is "known": the full-recall rung. */
export const KNOWN_FROM = LADDER_THRESHOLDS.full_recall;

export type StageBadgeState = {
  /** The learner's review state of the word; null = never answered. */
  review: { cardStatus: FsrsCardStatus; stability: number; lapses: number } | null;
  /**
   * The word has a passed "I know" proof (B2.5, `proof: true`). A proof is
   * the word's first answer, so every lapse counted on the card came after
   * it: a lapsed proof no longer makes the word known.
   */
  proven: boolean;
};

export function stageBadge(state: StageBadgeState): StageBadge {
  const { review } = state;
  if (review === null || review.cardStatus === 'NEW') return 'not_started';
  if (review.stability >= KNOWN_FROM) return 'known';
  if (state.proven && review.lapses === 0) return 'known';
  return review.stability >= REVIEWING_FROM ? 'reviewing' : 'learning';
}
