import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { glossOf } from '../text';
import { cardRng, choice, gradeChoice, pickFor } from './shared';
import type { VocabVariant } from './types';

/** Mode 1 (new word, S < 2): the English word, choose its meaning in the learner's language. */
export const enToL1: VocabVariant<'en_to_l1'> = {
  id: 'en_to_l1',
  payloadMode: VOCAB_VARIANT_MODE.en_to_l1,
  ladderFrom: 0,
  keyKind: 'choice',
  eligible: () => true,
  build(input) {
    const { target, locale } = input;
    const rng = cardRng(input, 'en_to_l1');
    const correct = glossOf(target, locale);
    return choice(
      { mode: 'en_to_l1', word: target.lemma, ipa: target.ipa ?? null },
      { option: correct, lexemeId: target.id },
      pickFor(input, rng, correct, (l) => glossOf(l, locale)),
      rng,
    );
  },
  grade: gradeChoice,
};
