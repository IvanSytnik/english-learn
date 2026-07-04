import { z } from "zod";
import { LocalizedStringSchema } from "../localized-string";

/**
 * Item content for kind = COLLOCATION.
 *
 * Multi-word units learned as a whole: verb+noun collocations ("make a
 * decision"), phrasal verbs ("give up"), fixed prepositional phrases
 * ("on time"). The unit of memory is the phrase, not its parts.
 */
export const CollocationContentSchema = z
  .object({
    source: z
      .object({
        /** The phrase itself, e.g. "turn on" or "make a decision". */
        phrase: z.string().trim().min(1),
        /** English example sentence using the phrase. */
        exampleSentence: z.string().trim().min(1).optional(),
      })
      .strict(),
    localized: z
      .object({
        /** Translation / meaning in the learner's language. */
        translation: LocalizedStringSchema,
        /** Optional register/usage note ("informal", "separable", ...). */
        usageNote: LocalizedStringSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type CollocationContent = z.infer<typeof CollocationContentSchema>;
