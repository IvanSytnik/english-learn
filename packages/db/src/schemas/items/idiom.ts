import { z } from 'zod';
import { LocalizedStringSchema } from '../localized-string';
import { PracticeSchema } from './practice';

/**
 * Item content for kind = IDIOM.
 *
 * Non-compositional expressions whose meaning cannot be derived from the
 * words ("piece of cake"). Differ from collocations in that the literal
 * reading is misleading, so we optionally store it to contrast.
 */
export const IdiomContentSchema = z
  .object({
    source: z
      .object({
        /** The idiom, e.g. "piece of cake". */
        phrase: z.string().trim().min(1),
        /** English example sentence using the idiom. */
        exampleSentence: z.string().trim().min(1).optional(),
      })
      .strict(),
    localized: z
      .object({
        /** Actual meaning in the learner's language. */
        meaning: LocalizedStringSchema,
        /** Optional translation of `source.exampleSentence`. */
        exampleTranslation: LocalizedStringSchema.optional(),
      })
      .strict(),
    /** The question asked for this item (see practice.ts). */
    practice: PracticeSchema.optional(),
  })
  .strict();

export type IdiomContent = z.infer<typeof IdiomContentSchema>;
