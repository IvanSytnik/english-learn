import { CefrLevelValue, PartOfSpeechSchema } from '@englishlearn/db/schemas';
import { z } from 'zod';

/**
 * The examples job (B6.4a): two more example sentences per published lexeme.
 * What goes to the model, the loose wire schema structured output checks
 * for the whole response, and the pending row. Strict per-item rules live in
 * ./validator.ts, so one bad word never discards the batch (as in B2.4).
 */

/** One lexeme as the prompt shows it. `key` is a short local id ("1".."N"). */
export const ExamplesRequestItemSchema = z.object({
  key: z.string().min(1),
  lemma: z.string().min(1),
  pos: PartOfSpeechSchema,
  sense: z.string(),
  cefrLevel: CefrLevelValue,
  topic: z.string().min(1),
  /** definitions.en — pins the sense the new sentences must show. */
  meaning: z.string().min(1),
  /** The lexeme's current example sentences; the new ones must differ. */
  existing: z.array(z.string().min(1)).min(1),
  /** examples[0].clozeTarget — the form already practised. */
  existingForm: z.string().min(1),
  /** Where examples[0] has the word: start (first word) / middle / end (last word). */
  existingPlace: z.enum(['start', 'middle', 'end']),
  /** The word inflects (INFLECTING_POS): one new sentence must vary form or place. */
  vary: z.boolean(),
});
export type ExamplesRequestItem = z.infer<typeof ExamplesRequestItemSchema>;

/** A pending lexeme: the request item plus its key in the snapshot. */
export type PendingExamples = ExamplesRequestItem & {
  lemmaKey: string;
  /** examples[0].sentence — the snapshot's `base`. */
  base: string;
};

const wireTranslation = z.object({ ru: z.string(), uk: z.string(), de: z.string() });

export const WireExamplesItemSchema = z.object({
  key: z.string(),
  lemma: z.string(),
  examples: z.array(
    z.object({ sentence: z.string(), clozeTarget: z.string(), translation: wireTranslation }),
  ),
});

export const WireExamplesResponseSchema = z.object({ items: z.array(WireExamplesItemSchema) });
export type WireExamplesResponse = z.infer<typeof WireExamplesResponseSchema>;
