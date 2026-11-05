import { VOCAB_CARD_VARIANTS, VOCAB_MODES, type VocabMode, type VocabVariantId } from '../types';
import { cloze } from './cloze';
import { cuedRecall } from './cued-recall';
import { definitionToEn } from './definition-to-en';
import { enToL1 } from './en-to-l1';
import { fullRecall } from './full-recall';
import { l1ToEn } from './l1-to-en';
import type { VocabRungVariant, VocabVariant } from './types';

/**
 * The variant registry (B6.3): every exercise variant by id — the rungs'
 * own cards in ladder order, then the variants served on a rung instead of
 * its own card (B6.5). `buildVocabCard`, `gradeVocabAnswer` and the ladder
 * dispatch through it — a new variant is one module plus one line here (and
 * its payload enum value, schema-first).
 */
export const VOCAB_VARIANTS: { readonly [M in VocabMode]: VocabRungVariant<M> } & {
  readonly [M in Exclude<VocabVariantId, VocabMode>]: VocabVariant<M>;
} = Object.freeze({
  en_to_l1: enToL1,
  l1_to_en: l1ToEn,
  cloze,
  cued_recall: cuedRecall,
  full_recall: fullRecall,
  definition_to_en: definitionToEn,
});

export const vocabVariant = <M extends VocabVariantId>(id: M): VocabVariant<M> =>
  VOCAB_VARIANTS[id] as unknown as VocabVariant<M>;

/** Ladder order: lowest stability rung first. */
export const VOCAB_LADDER: readonly VocabRungVariant[] = VOCAB_MODES.map(
  (id): VocabRungVariant => VOCAB_VARIANTS[id],
).sort((a, b) => a.ladderFrom - b.ladderFrom);

/** The variants served on each rung, the rung's own card first. */
export const RUNG_VARIANTS: Readonly<Record<VocabMode, readonly VocabVariantId[]>> = (() => {
  const byRung = Object.fromEntries(VOCAB_MODES.map((rung) => [rung, [rung]])) as Record<
    VocabMode,
    VocabVariantId[]
  >;
  for (const id of VOCAB_CARD_VARIANTS) {
    const { rung } = vocabVariant(id);
    if (id !== rung) byRung[rung].push(id);
  }
  return Object.freeze(byRung);
})();

export { VocabCardError } from './shared';
export type * from './types';
