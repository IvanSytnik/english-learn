import type { VocabMode } from '../types';
import { cloze } from './cloze';
import { cuedRecall } from './cued-recall';
import { enToL1 } from './en-to-l1';
import { fullRecall } from './full-recall';
import { l1ToEn } from './l1-to-en';
import type { VocabVariant } from './types';

/**
 * The variant registry (B6.3): every exercise variant by id, in ladder order.
 * `buildVocabCard`, `gradeVocabAnswer` and the ladder dispatch through it —
 * a new variant is one module plus one line here (and its payload enum value,
 * schema-first).
 */
export const VOCAB_VARIANTS: { readonly [M in VocabMode]: VocabVariant<M> } = Object.freeze({
  en_to_l1: enToL1,
  l1_to_en: l1ToEn,
  cloze,
  cued_recall: cuedRecall,
  full_recall: fullRecall,
});

/** Ladder order: lowest stability rung first. */
export const VOCAB_LADDER: readonly VocabVariant[] = Object.values(VOCAB_VARIANTS).sort(
  (a, b) => a.ladderFrom - b.ladderFrom,
);

export const vocabVariant = <M extends VocabMode>(id: M): VocabVariant<M> => VOCAB_VARIANTS[id];

export { VocabCardError } from './shared';
export type * from './types';
