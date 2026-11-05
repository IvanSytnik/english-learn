import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { seedFromString } from '../../policy/rng';
import { surfaceForms, wholeWordMatches } from '../text';
import type { VocabLexeme } from '../types';
import { gappedChoice } from './cloze';
import { atLeastB1, gradeChoice, VocabCardError } from './shared';
import type { VocabBuildInput, VocabCard, VocabVariant } from './types';

/**
 * Mode 3 for a B1+ learner (B6.5): one of the word's collocations with a gap
 * (`make a ___`), choose what fills it — served on the cloze rung instead of
 * it, chosen by card seed among the eligible variants. The collocation is
 * picked by card seed among those that hold the word exactly once and
 * something else; options are shape-matched like cloze. Not eligible when
 * none fits or fewer than three distractors share the form: cloze is served.
 */
export const collocation: VocabVariant<'collocation'> = {
  id: 'collocation',
  rung: 'cloze',
  payloadMode: VOCAB_VARIANT_MODE.collocation,
  keyKind: 'choice',
  eligible: (target, ctx) =>
    atLeastB1(ctx.learnerLevel) && collocationCard({ ...ctx, target }) !== null,
  build(input) {
    const card = collocationCard(input);
    if (!card) throw new VocabCardError(`"${input.target.lemma}" has no fair collocation`);
    return card;
  },
  grade: gradeChoice,
};

/**
 * The collocations a gap can be cut in, in stored order: the lemma or one of
 * its surface forms occurs exactly once as a whole word, and at least one
 * other word is left (`decision` alone is no collocation). `form` is the
 * occurrence as written.
 */
export function gappableCollocations(target: VocabLexeme): { phrase: string; form: string }[] {
  const forms = surfaceForms(target);
  return (target.collocations ?? []).flatMap((phrase) => {
    const matches = wholeWordMatches(phrase, forms);
    const only = matches.length === 1 ? matches[0] : undefined;
    if (only === undefined) return [];
    const rest = phrase.slice(0, only.index) + phrase.slice(only.index + only[0].length);
    return /\p{L}/u.test(rest) ? [{ phrase, form: only[0] }] : [];
  });
}

/** Index `seedFromString(cardSeed) mod n` over the gappable collocations; null when none or unfair. */
function collocationCard(input: VocabBuildInput): VocabCard | null {
  const phrases = gappableCollocations(input.target);
  const picked = phrases[seedFromString(input.seed) % phrases.length];
  return picked ? gappedChoice(input, 'collocation', picked.phrase, picked.form) : null;
}
