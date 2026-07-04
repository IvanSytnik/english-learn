import { z } from "zod";
import { LocalizedStringSchema } from "../localized-string";

/**
 * ListeningExercise content payload.
 *
 * The audio + English transcript are immutable source material. Comprehension
 * questions and instructions are localized.
 */
const ListeningQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: LocalizedStringSchema,
    /** Multiple-choice options (localized — they describe meaning, not English usage). */
    choices: z.array(LocalizedStringSchema).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
    explanation: LocalizedStringSchema.optional(),
  })
  .strict()
  .refine((q) => q.correctIndex < q.choices.length, {
    message: "correctIndex must reference an existing choice",
    path: ["correctIndex"],
  });

export const ListeningContentSchema = z
  .object({
    source: z
      .object({
        /** R2/CDN URL for the audio file. */
        audioUrl: z.string().url(),
        /** Duration in seconds (used to budget exercise time). */
        durationSec: z.number().positive(),
        /** English transcript — never translated, learners hear and read it. */
        transcript: z.string().trim().min(1),
      })
      .strict(),
    localized: z
      .object({
        instructions: LocalizedStringSchema,
        /** Optional pre-listening context (vocabulary hint, scenario). */
        contextNote: LocalizedStringSchema.optional(),
      })
      .strict(),
    questions: z.array(ListeningQuestionSchema).min(1),
  })
  .strict();

export type ListeningContent = z.infer<typeof ListeningContentSchema>;
export type ListeningQuestion = z.infer<typeof ListeningQuestionSchema>;
