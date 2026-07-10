import { z } from 'zod';
import { LocalizedStringSchema } from '../localized-string';

/**
 * DiagnosticItem content payload.
 *
 * Three sub-kinds reuse the same wrapper shape: the discriminator lives on the
 * Prisma column (`DiagnosticItem.kind`), not in JSON, so that admin SQL queries
 * stay simple. The JSON only carries text.
 *
 * For the diagnostic, instructions are minimal — the item type carries the
 * meaning. Question stem is English (it IS the test). Hints/explanations are
 * localized.
 */
export const DiagnosticContentSchema = z
  .object({
    source: z
      .object({
        /** English question stem, e.g. "Choose the correct form: I ___ to school." */
        stem: z.string().trim().min(1),
        /** English answer choices. */
        choices: z.array(z.string().trim().min(1)).min(2).max(6),
        correctIndex: z.number().int().nonnegative(),
      })
      .strict()
      .refine((s) => s.correctIndex < s.choices.length, {
        message: 'correctIndex must reference an existing choice',
        path: ['correctIndex'],
      }),
    localized: z
      .object({
        /** Shown only on review screen after diagnostic completes. */
        explanation: LocalizedStringSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type DiagnosticContent = z.infer<typeof DiagnosticContentSchema>;
