import { z } from "zod";
import { LocalizedStringSchema } from "../localized-string";

/**
 * Item content for kind = GRAMMAR_PATTERN.
 *
 * The atomic unit is one concrete grammatical pattern within a concept —
 * e.g. within "Present Simple" the third-person -s is one item, the
 * do/does negative is another. Granularity guideline: one item = one thing
 * a learner can get wrong independently.
 */
export const GrammarPatternContentSchema = z
  .object({
    source: z
      .object({
        /** Compact formula, e.g. "he/she/it + V-s" or "have/has + V3". */
        pattern: z.string().trim().min(1),
        /** English example demonstrating the pattern. */
        example: z.string().trim().min(1),
        /** Optional contrasting (wrong or contrastive) example. */
        contrastExample: z.string().trim().min(1).optional(),
      })
      .strict(),
    localized: z
      .object({
        /** Learner-language explanation of when/why the pattern applies. */
        explanation: LocalizedStringSchema,
        /** Optional usage nuance / common-mistake note. */
        usageNote: LocalizedStringSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type GrammarPatternContent = z.infer<typeof GrammarPatternContentSchema>;
