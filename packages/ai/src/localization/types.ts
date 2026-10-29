import {
  CefrLevelValue,
  LexemeExampleSchema,
  LocalizedStringSchema,
  PartOfSpeechSchema,
} from '@englishlearn/db/schemas';
import { z } from 'zod';

/**
 * Batch localization of DRAFT lexemes: what goes to the model, what the
 * model must return (the wire schema), and what is accepted into the
 * database (the strict per-item schema).
 *
 * The wire schema is deliberately loose — structured output checks it for the
 * whole response, so a refinement there would reject 19 good items for one
 * bad one. The rules live in BatchLocalizationItemSchema and the gloss checks
 * in ./validator.ts, applied item by item.
 */

/** One lexeme as the prompt shows it. `key` is a short local id ("1".."N"), never the cuid. */
export const LocalizationRequestItemSchema = z.object({
  key: z.string().min(1),
  lemma: z.string().min(1),
  pos: PartOfSpeechSchema,
  sense: z.string(),
  cefrLevel: CefrLevelValue,
  topic: z.string().min(1),
});
export type LocalizationRequestItem = z.infer<typeof LocalizationRequestItemSchema>;

/** A pending lexeme: the request item plus the database id it maps back to. */
export type PendingLexeme = LocalizationRequestItem & { id: string };

const wireTranslations = z.object({ ru: z.string(), uk: z.string(), de: z.string() });

export const WireLocalizationItemSchema = z.object({
  key: z.string(),
  lemma: z.string(),
  definitionEn: z.string(),
  translations: wireTranslations,
  examples: z.array(
    z.object({ sentence: z.string(), clozeTarget: z.string(), translation: wireTranslations }),
  ),
  collocations: z.array(z.string()),
});
export type WireLocalizationItem = z.infer<typeof WireLocalizationItemSchema>;

/** The response root (structured output needs an object, not an array). */
export const WireLocalizationResponseSchema = z.object({
  items: z.array(WireLocalizationItemSchema),
});
export type WireLocalizationResponse = z.infer<typeof WireLocalizationResponseSchema>;

/** ru, uk and de all present: a REVIEW lexeme is glossed in every learner language. */
export const FullTranslationsSchema = z
  .object({
    ru: z.string().trim().min(1),
    uk: z.string().trim().min(1),
    de: z.string().trim().min(1),
  })
  .strict();
export type FullTranslations = z.infer<typeof FullTranslationsSchema>;

/** An accepted item, in the Lexeme column shapes. */
export const BatchLocalizationItemSchema = z
  .object({
    id: z.string().min(1),
    lemma: z.string().min(1),
    pos: PartOfSpeechSchema,
    sense: z.string(),
    definitions: LocalizedStringSchema,
    translations: FullTranslationsSchema,
    examples: z
      .array(LexemeExampleSchema.and(z.object({ translation: FullTranslationsSchema })))
      .min(1)
      .max(3),
    collocations: z.array(z.string().trim().min(1)).max(5).default([]),
  })
  .strict();
export type BatchLocalizationItem = z.infer<typeof BatchLocalizationItemSchema>;

export const BatchLocalizationResponseSchema = z.array(BatchLocalizationItemSchema);
