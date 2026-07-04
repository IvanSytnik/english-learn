import { z } from "zod";
import { LocalizedStringSchema } from "../localized-string";

/**
 * GrammarExercise content payload.
 *
 * The grammar artefact (template + accepted answers) is English. Instructions,
 * hints and explanations are localized.
 */
export const GrammarContentSchema = z
  .object({
    source: z
      .object({
        /** English template with a single gap, e.g. "I ___ to school every day". */
        template: z.string().trim().min(1),
        /** Acceptable English answers (case-insensitive on read side). */
        acceptedAnswers: z.array(z.string().trim().min(1)).min(1),
      })
      .strict(),
    localized: z
      .object({
        instructions: LocalizedStringSchema,
        /** Shown after a wrong attempt. */
        hint: LocalizedStringSchema.optional(),
        /** Rule explanation shown after attempt completion. */
        explanation: LocalizedStringSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type GrammarContent = z.infer<typeof GrammarContentSchema>;
