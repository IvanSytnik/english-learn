import { seedFromString } from '../policy/rng';
import type { VocabVariantId } from './types';
import { RUNG_VARIANTS, VocabCardError, vocabVariant } from './variants';
import type { VocabBuildInput, VocabCard, VocabCardInput, VocabVariant } from './variants/types';

/**
 * One vocabulary question, built twice from the same input: when it is served
 * and when the answer is graded (stateless, like the diagnostic). `view` is
 * all the client ever gets — no correct index, no accepted answers, no lexeme
 * id (Axiom 3); `key` stays on the server. Each mode's card is built by its
 * variant (./variants, B6.3); this module only dispatches.
 */

export type {
  ChoiceVariantId,
  VocabAnswerKey,
  VocabBuildInput,
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
 * The card for the rung `input.mode`: one of the rung's eligible variants,
 * picked by card seed (`seedFromString(seed:variant) mod n` — a rung with one
 * eligible variant serves it, as before B6.5). When none is eligible, the
 * rung's own fallback chain (cloze → l1_to_en). The served variant is
 * `view.mode`.
 */
export function buildVocabCard(input: VocabCardInput): VocabCard {
  const eligible = RUNG_VARIANTS[input.mode].filter((id) =>
    vocabVariant(id).eligible(input.target, input),
  );
  const picked = eligible[seedFromString(`${input.seed}:variant`) % eligible.length];
  if (picked !== undefined) return buildVocabVariant(input, picked);

  let variant: VocabVariant = vocabVariant(input.mode);
  const seen = new Set<VocabVariantId>([variant.id]);
  for (;;) {
    const next = variant.fallback;
    if (next === undefined || seen.has(next)) {
      throw new VocabCardError(`"${input.target.lemma}" has no eligible variant (${input.mode})`);
    }
    seen.add(next);
    variant = vocabVariant(next);
    if (variant.eligible(input.target, input)) return buildVocabVariant(input, variant.id);
  }
}

/**
 * Exactly the card of variant `id` — a served card rebuilt from the variant
 * sealed in its reference (the grader of a typed answer, the proof). Throws
 * VocabCardError when that variant cannot be built for the word.
 */
export function buildVocabVariant(input: VocabBuildInput, id: VocabVariantId): VocabCard {
  return vocabVariant(id).build({ ...input, mode: id });
}
