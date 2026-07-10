import { z } from 'zod';
import { LocalizedStringSchema } from '../localized-string';

/**
 * Item content for kind = VOCAB_WORD.
 *
 * The atomic unit is a single English lexeme. `source` carries English-only
 * material; `localized` carries learner-language support.
 */
export const VocabWordContentSchema = z
  .object({
    source: z
      .object({
        /** The lexeme itself, e.g. "schedule". */
        headword: z.string().trim().min(1),
        /** Coarse POS tag for grouping/rendering, e.g. "noun", "verb". */
        partOfSpeech: z
          .enum(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'other'])
          .optional(),
        /** English example sentence using the headword. */
        exampleSentence: z.string().trim().min(1).optional(),
        /** IPA transcription, e.g. "/ˈʃɛdjuːl/". */
        ipa: z.string().trim().min(1).optional(),
      })
      .strict(),
    localized: z
      .object({
        /** Translation of the headword into the learner's language. */
        translation: LocalizedStringSchema,
        /** Optional fuller definition. */
        definition: LocalizedStringSchema.optional(),
        /** Optional translation of `source.exampleSentence`. */
        exampleTranslation: LocalizedStringSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type VocabWordContent = z.infer<typeof VocabWordContentSchema>;
