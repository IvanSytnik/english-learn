import type { FsrsCardState } from '../core/fsrs/types';
import type { VocabMode } from './types';

/**
 * The word ladder (B2.1 / B2.5): which of the five modes a word is practised
 * in, from its FSRS state before the answer — no RNG, no stored progress, so
 * replay and the grader always agree with what was served.
 *
 * Lower bounds on stability S (days), chosen on what ts-fsrs actually does
 * with our parameters: first GOOD 2.31 (learning), then 2.31 -> 10.97 ->
 * 46.3 -> 163 on reviews in time, so a word climbs one mode per review
 * (1 -> 2 -> 2 -> 3 -> 4 -> 5); a passed proof (EASY) starts at 8.30, in
 * cloze; a lapse at S ≈ 46 lands at 2.93, back in mode 2.
 */
export const LADDER_THRESHOLDS: Readonly<Record<Exclude<VocabMode, 'en_to_l1'>, number>> =
  Object.freeze({
    l1_to_en: 2,
    cloze: 7,
    cued_recall: 21,
    full_recall: 60,
  });

/** The mode a "Know -> prove" check uses: one cued recall answer. */
export const PROOF_MODE: VocabMode = 'cued_recall';

/** Mode for a word whose review state is `state` (null = never answered). */
export function vocabModeFor(
  state: Pick<FsrsCardState, 'stability' | 'cardStatus'> | null,
): VocabMode {
  if (state === null || state.cardStatus === 'NEW') return 'en_to_l1';
  const s = state.stability;
  if (s >= LADDER_THRESHOLDS.full_recall) return 'full_recall';
  if (s >= LADDER_THRESHOLDS.cued_recall) return 'cued_recall';
  if (s >= LADDER_THRESHOLDS.cloze) return 'cloze';
  if (s >= LADDER_THRESHOLDS.l1_to_en) return 'l1_to_en';
  return 'en_to_l1';
}
