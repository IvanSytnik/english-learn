import { z } from 'zod';
import { CONTRACTIONS } from './contractions';
import { normalizeTerm } from './forms';
import { type CatalogueIndex, isCatalogueTerm, isFunctionWordTerm } from './match';

/**
 * The pre-LLM gate of word generation (B6-SPEC §6 B6.10 step 0, V2-20 part
 * 2): whether a candidate may go to the LLM at all. Pure and server-side —
 * B6.10 must call it on every candidate before any LLM request, whatever the
 * client sent (the paste import already keeps these out of "not found"; this
 * is the safety net). A refused candidate becomes REJECTED with the reason,
 * no LLM call, no AiUsage row.
 *
 * Checked on the candidate normalized like a pasted term, in this order:
 * - `contraction`: an entry of the contraction table (`that'll`, `don't`);
 * - `function_word`: one of the 80 excluded headwords (`the`, `have to`,
 *   `can` — even though `can` the noun is a catalogue word);
 * - `apostrophe`: the candidate contains an apostrophe (any of its spellings)
 *   and is not a catalogue word or form — `o'clock` passes, `rock'n'roll`,
 *   `children's` (a possessive) do not.
 */

/** The closed set of refusal reasons, for B6.10's schema (`GenerationGateReasonSchema`). */
export const GENERATION_GATE_REASONS = ['apostrophe', 'contraction', 'function_word'] as const;
export type GenerationGateReason = (typeof GENERATION_GATE_REASONS)[number];
export const GenerationGateReasonSchema = z.enum(GENERATION_GATE_REASONS);

export type GenerationGateResult = { ok: true } | { ok: false; reason: GenerationGateReason };

/** Every apostrophe spelling normalizeTerm folds, plus the fullwidth one it does not. */
const APOSTROPHE = /['‘’‛ʼ`´＇]/u;

export function isGenerationCandidateAllowed(
  candidate: string,
  context: { index: CatalogueIndex },
): GenerationGateResult {
  const key = normalizeTerm(candidate);
  if (CONTRACTIONS.has(key)) return { ok: false, reason: 'contraction' };
  if (isFunctionWordTerm(key)) return { ok: false, reason: 'function_word' };
  if (APOSTROPHE.test(candidate) && !isCatalogueTerm(context.index, key)) {
    return { ok: false, reason: 'apostrophe' };
  }
  return { ok: true };
}
