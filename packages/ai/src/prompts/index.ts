import { z } from 'zod';

/**
 * Vocab exercise generation contract.
 * Used by admin's "Generate N exercises" flow.
 */
export const vocabExerciseSchema = z.object({
  prompt: z.string().min(10).max(500),
  targetLexeme: z.string().min(1).max(80),
  choices: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(10).max(500).optional(),
});

export type VocabExerciseDraft = z.infer<typeof vocabExerciseSchema>;

export const vocabBatchSchema = z.object({
  exercises: z.array(vocabExerciseSchema).min(1).max(20),
});

export type VocabBatch = z.infer<typeof vocabBatchSchema>;
