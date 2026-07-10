import { z } from 'zod';

/**
 * Layer 1: Item Memory — FSRS state model.
 *
 * Thin, typed wrapper types around ts-fsrs. The wrapper (wrapper.ts) is the
 * ONLY module that imports ts-fsrs; the rest of the codebase talks in these
 * types, so a future algorithm swap stays local.
 *
 * Conventions (parity with the BKT core):
 *   - All timestamps are Unix ms as bigint — bit-exact roundtrip with the
 *     Prisma BigInt columns on ItemReviewState.
 *   - State objects are immutable; every operation returns a new object.
 */

/** Learner's answer quality on a review. Mirrors ts-fsrs Rating (1..4). */
export const FSRS_RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export const FsrsRatingSchema = z.enum(FSRS_RATINGS);
export type FsrsRating = z.infer<typeof FsrsRatingSchema>;

/** Card lifecycle. Mirrors ts-fsrs State and the Prisma FsrsCardStatus enum. */
export const FSRS_CARD_STATUSES = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'] as const;
export const FsrsCardStatusSchema = z.enum(FSRS_CARD_STATUSES);
export type FsrsCardStatus = z.infer<typeof FsrsCardStatusSchema>;

/**
 * Immutable FSRS memory state for one (user, item) pair.
 * Field names match the Prisma ItemReviewState columns 1:1 so the Day 7
 * adapter is a trivial spread.
 */
export const FsrsCardStateSchema = z
  .object({
    stability: z.number().nonnegative(),
    difficulty: z.number().nonnegative(),
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    learningSteps: z.number().int().nonnegative(),
    cardStatus: FsrsCardStatusSchema,
    /** Next due moment, Unix ms. */
    dueAt: z.bigint(),
    /** Last review moment, Unix ms. Null until the first review. */
    lastReviewAt: z.bigint().nullable(),
  })
  .strict();

export type FsrsCardState = z.infer<typeof FsrsCardStateSchema>;

/** One review outcome — what happened and what the scheduler decided. */
export type FsrsReviewResult = {
  /** New immutable state after the review. */
  state: FsrsCardState;
  /** Interval granted by the scheduler, in days (0 for intra-day steps). */
  scheduledDays: number;
  /** Days elapsed since the previous review (0 on first review). */
  elapsedDays: number;
};
