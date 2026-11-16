import { z } from 'zod';
import { CONTRACTIONS } from './contractions';
import { normalizeTerm } from './forms';
import {
  type CatalogueIndex,
  isCatalogueTerm,
  isFunctionWordTerm,
  MULTIWORD_MAX_TOKENS,
} from './match';
import { COLLOQUIAL_REDUCTIONS } from './reductions';

/**
 * The pre-LLM gate of word generation (B6-SPEC §6 B6.10 step 0, V2-20 part
 * 2): whether a candidate may go to the LLM at all. Pure and server-side —
 * B6.10 must call it on every candidate before any LLM request, whatever the
 * client sent (the paste import already keeps these out of "not found"; this
 * is the safety net). A refused candidate becomes REJECTED with the reason,
 * no LLM call, no AiUsage row.
 *
 * Checked on the candidate normalized like a pasted term, in this order.
 * The shape of the candidate:
 * - `empty`: nothing left after normalization (no letter or digit);
 * - `too_long`: more than GENERATION_CANDIDATE_MAX_CHARS characters (the
 *   CHECK of `LexemeGenerationRequest.input`, B6-SPEC §1) or more than
 *   MULTIWORD_MAX_TOKENS words — a sentence, not a headword (the longest
 *   catalogue entry is 18 characters, 3 words).
 * The whole candidate:
 * - `contraction`: an entry of the contraction table (`that'll`, `don't`);
 * - `colloquial`: a reduction written without an apostrophe (`gonna`,
 *   `wanna`: ./reductions.ts, #46);
 * - `function_word`: one of the 80 excluded headwords (`the`, `have to`,
 *   `can` — even though `can` the noun is a catalogue word);
 * - `apostrophe`: the candidate contains an apostrophe (any of its spellings)
 *   and is not a catalogue word or form — `o'clock` passes, `rock'n'roll`,
 *   `children's` (a possessive) do not;
 * - `not_latin`: a word that is not ASCII letters and digits joined by single
 *   `'`, `-`, `.` or `/` (after accents are folded: `café` passes), or a
 *   candidate without one Latin letter — `слово`, `naïve€`, `123`. A
 *   catalogue term is never refused for its spelling.
 * Then word by word, the way the paste matcher reads a term (every window of
 * 1..4 words, the catalogue first): a window that is a contraction, a
 * reduction or a function word and not a catalogue word or form refuses the
 * candidate with that reason — `the blorf`, `have to blorf`, `gonna blorf`
 * (`blorf don't` is already an `apostrophe`). `look forward to` passes: `to` is a catalogue word. The
 * paste import never puts such a word in a not-found term (V2-18c, V2-19);
 * this holds it for any client.
 */

/** The closed set of refusal reasons, for B6.10's schema (`GenerationGateReasonSchema`). */
export const GENERATION_GATE_REASONS = [
  'apostrophe',
  'contraction',
  'function_word',
  'colloquial',
  'too_long',
  'not_latin',
  'empty',
] as const;
export type GenerationGateReason = (typeof GENERATION_GATE_REASONS)[number];
export const GenerationGateReasonSchema = z.enum(GENERATION_GATE_REASONS);

export type GenerationGateResult = { ok: true } | { ok: false; reason: GenerationGateReason };

/** `LexemeGenerationRequest.input` holds at most this many characters (B6-SPEC §1). */
export const GENERATION_CANDIDATE_MAX_CHARS = 40;

/** Every apostrophe spelling normalizeTerm folds, plus the fullwidth one it does not. */
const APOSTROPHE = /['‘’‛ʼ`´＇]/u;
/** One word of a headword: ASCII letters and digits, joined inside by one `'`, `-`, `.` or `/`. */
const LATIN_WORD = /^[a-z0-9]+(?:['./-][a-z0-9]+)*$/;
const LATIN_LETTER = /[a-z]/;

const refuse = (reason: GenerationGateReason): GenerationGateResult => ({ ok: false, reason });

/** Why a term on its own is no generation candidate (the catalogue is not asked here). */
function closedFormOf(key: string): 'contraction' | 'colloquial' | 'function_word' | null {
  if (CONTRACTIONS.has(key)) return 'contraction';
  if (COLLOQUIAL_REDUCTIONS.has(key)) return 'colloquial';
  if (isFunctionWordTerm(key)) return 'function_word';
  return null;
}

export function isGenerationCandidateAllowed(
  candidate: string,
  context: { index: CatalogueIndex },
): GenerationGateResult {
  // Bounded before anything else: the gate never works on a long input.
  if (candidate.length > GENERATION_CANDIDATE_MAX_CHARS * 4) return refuse('too_long');
  const key = normalizeTerm(candidate);
  if (key === '') return refuse('empty');
  const words = key.split(' ');
  if (key.length > GENERATION_CANDIDATE_MAX_CHARS || words.length > MULTIWORD_MAX_TOKENS) {
    return refuse('too_long');
  }

  const whole = closedFormOf(key);
  if (whole) return refuse(whole);
  const known = isCatalogueTerm(context.index, key);
  if (APOSTROPHE.test(candidate) && !known) return refuse('apostrophe');
  if (!known && !(LATIN_LETTER.test(key) && words.every((w) => LATIN_WORD.test(w)))) {
    return refuse('not_latin');
  }

  // Word by word, longest window first — the matcher's own reading of a term.
  if (words.length > 1) {
    for (let i = 0; i < words.length; i++) {
      for (let n = Math.min(MULTIWORD_MAX_TOKENS, words.length - i); n >= 1; n--) {
        if (n === words.length) continue;
        const window = words.slice(i, i + n).join(' ');
        if (isCatalogueTerm(context.index, window)) continue;
        const part = closedFormOf(window);
        if (part) return refuse(part);
      }
    }
  }
  return { ok: true };
}
