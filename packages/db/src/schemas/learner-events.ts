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
 * How the item was practised (V2, §5.3): pick the answer (recognition),
 * produce it (recall) or fill the gap (cloze). Accepted before anything
 * writes it (expand-first).
 */
export const PracticeModeSchema = z.enum(['recognition', 'recall', 'cloze']);
export type PracticeModeValue = z.infer<typeof PracticeModeSchema>;

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
    /** Rating fed to FSRS: GOOD / AGAIN, HARD for a correct hinted answer. */
    rating: FsrsRatingValue,
    /** IRT params fed to BKT, frozen at attempt time. */
    irt: IrtSnapshotSchema,
    /**
     * "I don't know" (no guess). Present only when true, so ordinary payloads
     * — including every event written before this field existed — are
     * unchanged. Folded exactly like an incorrect answer (correct = false,
     * rating AGAIN); kept for analytics and future no-guess modelling.
     */
    dontKnow: z.literal(true).optional(),
    /**
     * The learner opened the hint (`H`) at least once before answering.
     * Present only when true, like `dontKnow`. A correct hinted answer is rated
     * HARD and leaves pKnown unchanged (§8 #11); an incorrect one folds like
     * any other miss.
     */
    hinted: z.literal(true).optional(),
    /**
     * Practice mode of the attempt. Optional: every event written before the
     * field existed has none, and replay must keep accepting it. Not folded.
     */
    mode: PracticeModeSchema.optional(),
    /**
     * A passed "Know -> prove" check on a new word (B2.5): one recall answer
     * that is rated EASY, so FSRS schedules the word as already known. Present
     * only when true; a failed proof is an ordinary attempt without the flag.
     * Not folded — the frozen rating carries it. Proven words do not count
     * toward the daily new-word limit.
     */
    proof: z.literal(true).optional(),
  })
  .strict()
  .refine((p) => !(p.dontKnow && p.correct), {
    message: "a don't-know attempt cannot be correct",
    path: ['correct'],
  })
  .refine(
    (p) => !p.proof || (p.correct && p.rating === 'EASY' && p.mode === 'recall' && !p.hinted),
    { message: 'a proof is a correct, unhinted recall answer rated EASY', path: ['proof'] },
  );
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
 * `score` is the formula's [0,1] input — the fraction correct for the
 * accuracy estimator, a level score (A2 0.25 … C1 1.0) for the ladder; never
 * shown to the learner. `level` is the axis's own assessed level when the
 * estimator measures one (ladder). `answered` is how many diagnostic items fed
 * it — used downstream to decide whether the axis carries enough signal to
 * trust (sparse-pool guard, R4). Frozen so replay is reproducible even if the
 * estimator changes.
 */
export const AxisEstimateSchema = z
  .object({
    axis: DiagnosticAxisValue,
    score: z.number().min(0).max(1),
    answered: z.number().int().nonnegative(),
    level: CefrLevelValue.optional(),
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
    /** Global level of the attempt (anchor for axes without their own level). */
    assessedLevel: CefrLevelValue,
    /** Which ThetaEstimator produced `axes` (audit only). */
    estimator: z.enum(['accuracy', 'ladder']).optional(),
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
  .strict()
  // The ladder anchors every axis on its own level: an axis without one would
  // silently fall back to the global level, so a ladder payload must carry it.
  .superRefine((p, ctx) => {
    if (p.estimator !== 'ladder') return;
    p.axes.forEach((a, i) => {
      if (a.answered > 0 && a.level === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['axes', i, 'level'],
          message: 'a ladder estimate needs the axis level',
        });
      }
    });
  });
export type LearnerBootstrappedPayload = z.infer<typeof LearnerBootstrappedPayloadSchema>;

export function parseLearnerBootstrappedPayload(json: unknown): LearnerBootstrappedPayload {
  return LearnerBootstrappedPayloadSchema.parse(json);
}

export function safeParseLearnerBootstrappedPayload(json: unknown) {
  return LearnerBootstrappedPayloadSchema.safeParse(json);
}
