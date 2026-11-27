import { CefrLevelValue, PartOfSpeechSchema } from '@englishlearn/db/schemas';
import { z } from 'zod';

/**
 * Lexeme generation (B6-SPEC §6, B6.10 step 2; prompt and schema written in
 * B6.9 so the eval harness evaluates the real thing). What goes to the model
 * and the loose wire schema structured output enforces for the whole
 * response. Strict per-item rules live in ./validator.ts, so one bad word
 * never discards the batch (as in B2.4 / B6.4a).
 */

/** At most this many candidates per LLM call (B6-SPEC §6). */
export const LEXEME_GEN_BATCH_MAX = 10;
/** Distinct entries one candidate may yield (a homograph with two common meanings). */
export const LEXEME_GEN_MAX_ENTRIES = 2;
export const LEXEME_GEN_EXAMPLES = 3;
export const LEXEME_GEN_MAX_COLLOCATIONS = 3;

/** One candidate as the prompt shows it: a short local key and the normalized input. */
export type LexemeGenRequestItem = { key: string; input: string };

/**
 * Why a candidate is not generated. `misspelling` carries the likely word in
 * `suggestion` (B6.10 may offer it; it is never generated in its place).
 */
export const LEXEME_GEN_REJECT_REASONS = [
  'misspelling',
  'not_english',
  'proper_noun',
  'offensive',
  'not_a_word',
] as const;
export const LexemeGenRejectReasonSchema = z.enum(LEXEME_GEN_REJECT_REASONS);
export type LexemeGenRejectReason = z.infer<typeof LexemeGenRejectReasonSchema>;

const wireTranslation = z.object({ ru: z.string(), uk: z.string(), de: z.string() });

export const WireLexemeEntrySchema = z.object({
  lemma: z.string(),
  pos: PartOfSpeechSchema,
  /** '' for the only common meaning; else a 1–3 word label ("month", "animal"). */
  sense: z.string(),
  definitionEn: z.string(),
  translations: wireTranslation,
  examples: z.array(
    z.object({ sentence: z.string(), clozeTarget: z.string(), translation: wireTranslation }),
  ),
  collocations: z.array(z.string()),
  /** Used only when wordfreq has no frequency for the lemma (`levelEstimated`). */
  cefrEstimate: CefrLevelValue,
  /** Informal / slang register — shown as a note, never a reason to reject. */
  informal: z.boolean(),
});
export type WireLexemeEntry = z.infer<typeof WireLexemeEntrySchema>;

export const WireLexemeGenItemSchema = z.object({
  key: z.string(),
  isWord: z.boolean(),
  rejectReason: LexemeGenRejectReasonSchema.nullable(),
  suggestion: z.string().nullable(),
  entries: z.array(WireLexemeEntrySchema),
});
export type WireLexemeGenItem = z.infer<typeof WireLexemeGenItemSchema>;

export const WireLexemeGenResponseSchema = z.object({ items: z.array(WireLexemeGenItemSchema) });
export type WireLexemeGenResponse = z.infer<typeof WireLexemeGenResponseSchema>;
