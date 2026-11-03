import type { VocabMode } from './types';
import { VocabCardError, vocabVariant } from './variants';
import type { VocabCard, VocabCardInput, VocabVariant } from './variants/types';

/**
 * One vocabulary question, built twice from the same input: when it is served
 * and when the answer is graded (stateless, like the diagnostic). `view` is
 * all the client ever gets — no correct index, no accepted answers, no lexeme
 * id (Axiom 3); `key` stays on the server. Each mode's card is built by its
 * variant (./variants, B6.3); this module only dispatches.
 */

export type {
  VocabAnswerKey,
  VocabCard,
  VocabCardInput,
  VocabCardView,
} from './variants/types';
export { VocabCardError };

/**
 * Seed of one served question: the same until the word is answered (its
 * review moment changes), so a reload shows the same choices and the grader
 * rebuilds exactly what was shown.
 */
export const cardSeed = (args: { userId: string; itemId: string; lastReviewAt: bigint | null }) =>
  `${args.userId}:${args.itemId}:${args.lastReviewAt ?? 'new'}`;

/**
 * The card for `input.mode`, or — when that variant is not eligible for the
 * word — for its fallback (cloze → l1_to_en). The served mode is
 * `view.mode`.
 */
export function buildVocabCard(input: VocabCardInput): VocabCard {
  let variant: VocabVariant = vocabVariant(input.mode);
  const seen = new Set<VocabMode>();
  while (!variant.eligible(input.target, input)) {
    seen.add(variant.id);
    if (variant.fallback === undefined || seen.has(variant.fallback)) {
      throw new VocabCardError(`"${input.target.lemma}" has no eligible variant (${input.mode})`);
    }
    variant = vocabVariant(variant.fallback);
  }
  return variant.build({ ...input, mode: variant.id });
}
