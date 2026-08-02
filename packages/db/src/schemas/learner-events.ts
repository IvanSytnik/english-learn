import { z } from 'zod';

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
export const LearnerEventTypeValue = z.enum(['ITEM_ATTEMPTED', 'LEARNER_BOOTSTRAPPED']);
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
export const FsrsRatingValue = z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']);
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

// ─────────────────────────────────────────────────────────────
// LEARNER_BOOTSTRAPPED (Diagnostic v2)
// ─────────────────────────────────────────────────────────────

/**
 * Diagnostic skill axes. Mirror of the Prisma DiagnosticKind enum. These are
 * the axes along which the diagnostic estimates ability; each Concept inherits
 * from the axis matching its ConceptCategory (see bootstrap.ts).
 */
export const DiagnosticAxisValue = z.enum(['VOCAB', 'GRAMMAR', 'LISTENING']);
export type DiagnosticAxisValue = z.infer<typeof DiagnosticAxisValue>;

export const CefrLevelValue = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type CefrLevelValue = z.infer<typeof CefrLevelValue>;

/**
 * Per-axis ability estimate produced by the ThetaEstimator.
 *
 * `accuracy` is the raw signal (fraction correct on the axis). `answered` is
 * how many diagnostic items fed it — used downstream to decide whether the
 * axis carries enough signal to trust (sparse-pool guard, R4). Frozen so
 * replay is reproducible even if the estimator changes.
 */
export const AxisEstimateSchema = z
  .object({
    axis: DiagnosticAxisValue,
    accuracy: z.number().min(0).max(1),
    answered: z.number().int().nonnegative(),
  })
  .strict();
export type AxisEstimate = z.infer<typeof AxisEstimateSchema>;

/**
 * One concept's initial BKT snapshot, computed by bootstrap.ts.
 *
 * This is the FULL BKT state (all five params + counters), not just pKnown —
 * so apply.ts can persist it via bktStateToRow with no further derivation.
 * pLearn/pSlip/pGuess/pForgetLambda are the canonical BKT_DEFAULTS; only
 * pKnown carries diagnostic signal. observationCount is 0 (bootstrap is a
 * starting point, not observed practice).
 */
export const BootstrapConceptSnapshotSchema = z
  .object({
    conceptId: z.string().min(1),
    pKnown: z.number().min(0).max(1),
    pLearn: z.number().min(0).max(1),
    pSlip: z.number().min(0).max(1),
    pGuess: z.number().min(0).max(1),
    pForgetLambda: z.number().min(0),
    /** Provenance: which axis drove this concept, or null if left on prior. */
    sourceAxis: DiagnosticAxisValue.nullable(),
  })
  .strict();
export type BootstrapConceptSnapshot = z.infer<typeof BootstrapConceptSnapshotSchema>;

/**
 * Payload for LearnerEventType.LEARNER_BOOTSTRAPPED.
 *
 * SELF-CONTAINED by design (same discipline as ITEM_ATTEMPTED): it carries the
 * fully-computed per-concept snapshots AND the inputs + formula version that
 * produced them. A replay years from now, under a v2 mapping formula,
 * reproduces the v1 result bit-for-bit because the result itself is frozen
 * here — apply.ts does NOT recompute the mapping, it just persists snapshots.
 *
 * `formulaVersion` + `mappingConstants` are recorded for auditability and to
 * make a future re-bootstrap / migration decision explainable, NOT because
 * replay needs to recompute. Replay reads `snapshots` directly.
 */
export const LearnerBootstrappedPayloadSchema = z
  .object({
    /** Source diagnostic attempt (audit trail; not used by fold). */
    diagnosticAttemptId: z.string().min(1),
    /** Global level from the pseudo-CAT branching (anchor for levelFactor). */
    assessedLevel: CefrLevelValue,
    /** Per-axis raw estimates that fed the mapping. */
    axes: z.array(AxisEstimateSchema),
    /** Mapping formula identifier — bump when the θ→pKnown formula changes. */
    formulaVersion: z.literal('v1'),
    /** The exact constants used, frozen for audit. */
    mappingConstants: z
      .object({
        floor: z.number().min(0).max(1),
        ceiling: z.number().min(0).max(1),
        aboveLevelFactor: z.number().min(0).max(1),
        minAnswersPerAxis: z.number().int().nonnegative(),
      })
      .strict(),
    /** Fully-computed per-concept snapshots — the thing fold persists. */
    snapshots: z.array(BootstrapConceptSnapshotSchema).min(1),
  })
  .strict();
export type LearnerBootstrappedPayload = z.infer<typeof LearnerBootstrappedPayloadSchema>;

export function parseLearnerBootstrappedPayload(json: unknown): LearnerBootstrappedPayload {
  return LearnerBootstrappedPayloadSchema.parse(json);
}

export function safeParseLearnerBootstrappedPayload(json: unknown) {
  return LearnerBootstrappedPayloadSchema.safeParse(json);
}
