import { z } from 'zod';
import { LocalizedStringSchema } from '../localized-string';

/**
 * VocabExercise content payload.
 *
 * Structure:
 *   - `source`: English-only material (the lexeme being learned, English usage).
 *   - `localized`: instructions and per-locale support strings.
 *
 * Choices remain in English (the learner picks the English word/phrase).
 * Choice explanations (why the wrong ones are wrong) are localized.
 */
export const VocabContentSchema = z
  .object({
    source: z
      .object({
        /** The English lexeme being tested, e.g. "ephemeral". */
        targetLexeme: z.string().trim().min(1),
        /** Optional English example sentence using the lexeme. */
        exampleSentence: z.string().trim().min(1).optional(),
      })
      .strict(),
    localized: z
      .object({
        /** "Match the word to its definition." */
        instructions: LocalizedStringSchema,
        /** Question prompt shown above choices. */
        prompt: LocalizedStringSchema,
        /** Per-locale definition (the correct answer's meaning). */
        explanation: LocalizedStringSchema.optional(),
        /** Optional per-locale translation of `source.exampleSentence`. */
        exampleTranslation: LocalizedStringSchema.optional(),
      })
      .strict(),
    /** Multiple-choice options. English strings (the words themselves). */
    choices: z.array(z.string().trim().min(1)).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
  })
  .strict()
  .refine((c) => c.correctIndex < c.choices.length, {
    message: 'correctIndex must reference an existing choice',
    path: ['correctIndex'],
  });

export type VocabContent = z.infer<typeof VocabContentSchema>;
