import type { FsrsCardState } from '../core/fsrs/types';
import type { VocabMode } from './types';
import { VOCAB_LADDER, VOCAB_VARIANTS } from './variants';

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
    l1_to_en: VOCAB_VARIANTS.l1_to_en.ladderFrom,
    cloze: VOCAB_VARIANTS.cloze.ladderFrom,
    cued_recall: VOCAB_VARIANTS.cued_recall.ladderFrom,
    full_recall: VOCAB_VARIANTS.full_recall.ladderFrom,
  });

/** The mode a "Know -> prove" check uses: one cued recall answer. */
export const PROOF_MODE: VocabMode = 'cued_recall';

/** Mode for a word whose review state is `state` (null = never answered). */
export function vocabModeFor(
  state: Pick<FsrsCardState, 'stability' | 'cardStatus'> | null,
): VocabMode {
  if (state === null || state.cardStatus === 'NEW') return 'en_to_l1';
  // The highest rung whose lower bound the stability has reached (registry order).
  let mode: VocabMode = 'en_to_l1';
  for (const variant of VOCAB_LADDER) if (state.stability >= variant.ladderFrom) mode = variant.id;
  return mode;
}
