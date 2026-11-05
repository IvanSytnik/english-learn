import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { DISTRACTOR_COUNT } from '../distractors';
import {
  atLeastB1,
  cardRng,
  choice,
  gradeChoice,
  namesWord,
  pickFor,
  revealsWord,
  VocabCardError,
} from './shared';
import type { VocabBuildInput, VocabCard, VocabVariant } from './types';

/**
 * Mode 2 for a B1+ learner (B6.5): the English definition, choose the English
 * word — served on the l1_to_en rung instead of it, chosen by card seed
 * among the eligible variants. Not eligible when the definition gives the
 * word away (its lemma, a spelling variant or any of its surface forms), or
 * when fewer than three fair distractors are left: l1_to_en is served.
 */
export const definitionToEn: VocabVariant<'definition_to_en'> = {
  id: 'definition_to_en',
  rung: 'l1_to_en',
  payloadMode: VOCAB_VARIANT_MODE.definition_to_en,
  keyKind: 'choice',
  eligible: (target, ctx) =>
    atLeastB1(ctx.learnerLevel) && definitionCard({ ...ctx, target }) !== null,
  build(input) {
    const card = definitionCard(input);
    if (!card) throw new VocabCardError(`"${input.target.lemma}" has no fair definition card`);
    return card;
  },
  grade: gradeChoice,
};

/** Null when the definition leaks the word or too few distractors survive the filter. */
function definitionCard(input: VocabBuildInput): VocabCard | null {
  const { target } = input;
  const definition = target.definitions.en;
  if (definition.trim() === '' || revealsWord(definition, target)) return null;
  // Filtered once, before picking: a word the definition names (`buy` in
  // "to buy something") would be a second right answer. Never re-picked.
  const pool = input.pool.filter((l) => !namesWord(definition, l));
  const rng = cardRng(input, 'definition_to_en');
  const distractors = pickFor({ ...input, pool }, rng, target.lemma, (l) => l.lemma);
  if (distractors.length < DISTRACTOR_COUNT) return null;
  return choice(
    { mode: 'definition_to_en', definition },
    { option: target.lemma, lexemeId: target.id },
    distractors,
    rng,
  );
}
