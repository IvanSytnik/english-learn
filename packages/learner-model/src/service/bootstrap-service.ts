import type {
  CefrLevelValue,
  DiagnosticAxisValue,
  LearnerBootstrappedPayload,
} from '@englishlearn/db/schemas';
import { bktStateToRow } from '../adapters/concept-mastery';
import {
  type BootstrapConcept,
  buildBootstrapSnapshots,
  FORMULA_VERSION,
  MAPPING_V1,
  accuracyBasedEstimator,
  type DiagnosticAnswerFact,
  type ThetaEstimator,
} from '../diagnostic';
import { applyLearnerBootstrapped } from './apply';
import type { LearnerModelDb } from './db-port';
import { buildLearnerBootstrappedEvent } from './event-store';

/**
 * BootstrapService: the single write path for diagnostic → learner-model
 * initialization. Symmetric to LearnerService (which owns recordOutcome).
 *
 * READ path is the diagnostic pipeline (pure); this is the WRITE path. It:
 *   1. Guards strictly-once (decision 7.a): bootstrap is only valid as the
 *      user's FIRST learner event. A completed re-diagnostic still runs, it
 *      just doesn't write a second event (returns ALREADY_BOOTSTRAPPED).
 *   2. Estimates per-axis ability (ThetaEstimator seam, decision 5.c).
 *   3. Maps to conservative per-concept snapshots (formula v1, decision 9.a).
 *   4. Writes ONE LEARNER_BOOTSTRAPPED event + upserts N ConceptMastery rows
 *      in a single transaction — preserving "no direct mastery UPDATE outside
 *      an event" and keeping replay honest.
 */

export type BootstrapInputData = {
  userId: string;
  diagnosticAttemptId: string;
  /** Global level from the pseudo-CAT branching (must be non-null: caller
   *  only bootstraps COMPLETED attempts with a resolved level). */
  assessedLevel: CefrLevelValue;
  /** Graded diagnostic answers (axis = DiagnosticItem.kind). */
  answers: readonly DiagnosticAnswerFact[];
  /** Concepts eligible for bootstrap (typically all 15 seed concepts). */
  concepts: readonly BootstrapConcept[];
  /** Override the bootstrap moment (Unix ms). Tests/backfills only. */
  occurredAtMs?: bigint;
};

export type BootstrapResult =
  | {
      ok: true;
      occurredAt: bigint;
      bootstrappedConceptIds: string[];
      skipped: { conceptId: string; reason: 'no_axis' | 'sparse_axis' }[];
    }
  | { ok: false; error: 'ALREADY_BOOTSTRAPPED' }
  | { ok: false; error: 'NO_CONCEPTS_BOOTSTRAPPED' };

export type BootstrapServiceDeps = {
  /** Swap-in point for the future irt2plEstimator. Defaults to accuracy. */
  estimator?: ThetaEstimator;
};

export function createBootstrapService(db: LearnerModelDb, deps: BootstrapServiceDeps = {}) {
  const estimator = deps.estimator ?? accuracyBasedEstimator;

  return {
    async bootstrapFromDiagnostic(input: BootstrapInputData): Promise<BootstrapResult> {
      const occurredAt = input.occurredAtMs ?? BigInt(Date.now());

      // Estimate + map OUTSIDE the tx — pure, no DB reads needed.
      const axes = estimator.estimate(input.answers);
      const { snapshots, skipped } = buildBootstrapSnapshots({
        concepts: input.concepts,
        axes,
        assessedLevel: input.assessedLevel,
        constants: MAPPING_V1,
      });

      // Nothing measurable to write (e.g. every axis sparse) → don't emit an
      // empty event; leave the learner entirely on the selection prior.
      if (snapshots.length === 0) {
        return { ok: false, error: 'NO_CONCEPTS_BOOTSTRAPPED' };
      }

      const payload: LearnerBootstrappedPayload = {
        diagnosticAttemptId: input.diagnosticAttemptId,
        assessedLevel: input.assessedLevel,
        axes: axes.map((a) => ({ axis: a.axis, accuracy: a.accuracy, answered: a.answered })),
        formulaVersion: FORMULA_VERSION,
        mappingConstants: {
          floor: MAPPING_V1.floor,
          ceiling: MAPPING_V1.ceiling,
          aboveLevelFactor: MAPPING_V1.aboveLevelFactor,
          minAnswersPerAxis: MAPPING_V1.minAnswersPerAxis,
        },
        snapshots,
      };

      const event = buildLearnerBootstrappedEvent({
        userId: input.userId,
        occurredAt,
        payload,
      });

      // Fold outside the tx: bootstrap fold is pure and reads no prior state.
      const states = applyLearnerBootstrapped(payload, occurredAt);

      const result = await db.runInTx(async (tx) => {
        // Strictly-once guard INSIDE the tx: count under the same isolation as
        // the write, so two concurrent diagnostics can't both pass the check.
        const existing = await tx.countEvents(input.userId);
        if (existing > 0) {
          return { guarded: true as const };
        }

        await tx.appendEvent(event);

        // Upsert every concept snapshot. Sequential on purpose: N ≤ number of
        // concepts (15 today), and a single tx keeps it atomic.
        for (const s of states) {
          await tx.upsertConceptMastery(input.userId, s.conceptId, bktStateToRow(s.bkt));
        }

        return { guarded: false as const };
      });

      if (result.guarded) {
        return { ok: false, error: 'ALREADY_BOOTSTRAPPED' };
      }

      return {
        ok: true,
        occurredAt,
        bootstrappedConceptIds: states.map((s) => s.conceptId),
        skipped,
      };
    },
  };
}

export type BootstrapService = ReturnType<typeof createBootstrapService>;

/** Re-export for callers assembling the axis list. */
export type { DiagnosticAxisValue };
