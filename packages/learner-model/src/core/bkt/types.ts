import { z } from 'zod';

/**
 * BKT state for a single (user, concept) pair.
 *
 * Pure data — no methods, no Prisma coupling.
 * The adapter layer (Day 7) maps this to/from ConceptMastery rows.
 */
export const BktStateSchema = z.object({
  pKnown: z.number().min(0).max(1),
  pLearn: z.number().min(0).max(1),
  pSlip: z.number().min(0).max(1),
  pGuess: z.number().min(0).max(1),
  pForgetLambda: z.number().min(0),
  /** Unix ms of the last update — anchor for forgetting decay. */
  lastUpdatedAt: z.number().int().nonnegative(),
  /** Number of outcomes folded into this state. Diagnostic only. */
  observationCount: z.number().int().nonnegative(),
});
export type BktState = z.infer<typeof BktStateSchema>;

/**
 * IRT 2PL item parameters.
 *
 * Placeholder on Concept until Day 5-6 introduces Item entity.
 * - a (discrimination): how sharply the item separates known vs unknown. Typical 0.5–2.5.
 * - b (difficulty): θ at which P(correct | known) = 0.5. Typical -3..+3.
 */
export const IrtParamsSchema = z.object({
  a: z.number().positive(),
  b: z.number(),
});
export type IrtParams = z.infer<typeof IrtParamsSchema>;

/** Single observation feeding into BKT update. */
export const BktOutcomeSchema = z.object({
  correct: z.boolean(),
  /** Unix ms when the outcome was produced. */
  timestamp: z.number().int().nonnegative(),
  /** Optional IRT params of the item that produced this outcome. */
  item: IrtParamsSchema.optional(),
});
export type BktOutcome = z.infer<typeof BktOutcomeSchema>;
