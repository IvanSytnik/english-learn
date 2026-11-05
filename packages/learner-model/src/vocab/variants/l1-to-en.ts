import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { cardRng, choice, gradeChoice, pickFor, promptGloss } from './shared';
import type { VocabRungVariant } from './types';

/** Mode 2 (2 ≤ S < 7): the meaning, choose the English word. */
export const l1ToEn: VocabRungVariant<'l1_to_en'> = {
  id: 'l1_to_en',
  rung: 'l1_to_en',
  payloadMode: VOCAB_VARIANT_MODE.l1_to_en,
  ladderFrom: 2,
  keyKind: 'choice',
  eligible: () => true,
  build(input) {
    const { target, locale } = input;
    const rng = cardRng(input, 'l1_to_en');
    return choice(
      { mode: 'l1_to_en', gloss: promptGloss(target, locale) },
      { option: target.lemma, lexemeId: target.id },
      // V2-14: a distractor whose gloss overlaps the prompt would also fit it.
      pickFor(input, rng, target.lemma, (l) => l.lemma, { avoidGlossOverlap: true }),
      rng,
    );
  },
  grade: gradeChoice,
};
