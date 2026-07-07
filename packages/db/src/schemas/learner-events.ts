import { z } from "zod";

/**
 * Payload schemas for LearnerEvent.payload (jsonb), one per LearnerEventType.
 *
 * Design principle: the payload is a SELF-CONTAINED snapshot. Everything the
 * replay job needs to reproduce the exact projection state lives here —
 * including values that could be re-derived today (rating) or re-read from
 * other tables (irt). Freezing them in the event makes replay bit-exact even
 * if the rating-mapping policy changes or the item gets IRT-recalibrated
 * later. Events are facts; facts don't change.
 */

/** Zod twin of the Prisma LearnerEventType enum (canonical). */
export const LearnerEventTypeValue = z.enum(["ITEM_ATTEMPTED"]);
export type LearnerEventTypeValue = z.infer<typeof LearnerEventTypeValue>;

/** Snapshot of the item's IRT 2PL params at attempt time. */
export const IrtSnapshotSchema = z
  .object({
    a: z.number().positive(),
    b: z.number(),
  })
  .strict();
export type IrtSnapshot = z.infer<typeof IrtSnapshotSchema>;

/** FSRS rating derived from the outcome at attempt time (policy snapshot). */
export const FsrsRatingValue = z.enum(["AGAIN", "HARD", "GOOD", "EASY"]);
export type FsrsRatingValue = z.infer<typeof FsrsRatingValue>;

/**
 * Payload for LearnerEventType.ITEM_ATTEMPTED.
 *
 * conceptId is denormalized from Item so replay never joins; if an Item is
 * ever re-parented (should not happen), history stays truthful to what the
 * learner actually practiced.
 */
export const ItemAttemptedPayloadSchema = z
  .object({
    itemId: z.string().min(1),
    conceptId: z.string().min(1),
    correct: z.boolean(),
    /** Response time in ms; null when the client did not measure it. */
    timeMs: z.number().int().positive().nullable(),
    /** Rating fed to FSRS (binary mapping for now: GOOD/AGAIN). */
    rating: FsrsRatingValue,
    /** IRT params fed to BKT, frozen at attempt time. */
    irt: IrtSnapshotSchema,
  })
  .strict();
export type ItemAttemptedPayload = z.infer<typeof ItemAttemptedPayloadSchema>;

export function parseItemAttemptedPayload(json: unknown): ItemAttemptedPayload {
  return ItemAttemptedPayloadSchema.parse(json);
}

export function safeParseItemAttemptedPayload(json: unknown) {
  return ItemAttemptedPayloadSchema.safeParse(json);
}
