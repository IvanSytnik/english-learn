import type {
  CefrLevelValue,
  DiagnosticAxisValue,
  LearnerBootstrappedPayload,
} from '@englishlearn/db/schemas';
import { bktStateToRow, rowToBktState } from '../adapters/concept-mastery';
import {
  type BootstrapConcept,
  buildBootstrapSnapshots,
  type DiagnosticAnswerFact,
  FORMULA_VERSION,
  ladderEstimator,
  MAPPING_V1,
  type ThetaEstimator,
} from '../diagnostic';
import { applyLearnerBootstrapped } from './apply';
import type { LearnerModelDb } from './db-port';
import { buildLearnerBootstrappedEvent } from './event-store';
import { type Clock, nextOccurredAt, systemClock } from './occurred-at';

/**
 * BootstrapService: the single write path for diagnostic → learner-model
 * initialization. Symmetric to LearnerService (which owns recordOutcome).
 *
 * READ path is the diagnostic pipeline (pure); this is the WRITE path. It:
 *   1. Guards strictly-once (decision 7.a): at most one LEARNER_BOOTSTRAPPED
 *      per user. A completed re-diagnostic still runs, it just doesn't write
 *      a second event (returns ALREADY_BOOTSTRAPPED).
 *   2. Estimates per-axis ability (ThetaEstimator seam, decision 5.c).
 *   3. Maps to conservative per-concept snapshots (formula v1, decision 9.a).
 *   4. Writes ONE LEARNER_BOOTSTRAPPED event + upserts a ConceptMastery row
 *      for every snapshot concept not yet practised (practice wins), in a
 *      single transaction — preserving "no direct mastery UPDATE outside an
 *      event" and keeping replay honest. The event is written even if every
 *      concept was already practised: the diagnostic still counts as done.
 */

/**
 * The bootstrap transaction's timeout (B6.2b, pitfall 199). Its statements
 * are O(1) in the number of concepts now, but the advisory-lock wait and the
 * Neon pooler round trips under load count against Prisma's 5 s default;
 * this bounds a stuck transaction without failing a slow-but-healthy one.
 */
export const BOOTSTRAP_TX_TIMEOUT_MS = 15_000;

export type BootstrapInputData = {
  userId: string;
  diagnosticAttemptId: string;
  /** Global level of the attempt (must be non-null: caller only
   *  bootstraps COMPLETED attempts with a resolved level). */
  assessedLevel: CefrLevelValue;
  /** Graded diagnostic answers (axis = DiagnosticItem.kind). */
  answers: readonly DiagnosticAnswerFact[];
  /** Concepts eligible for bootstrap (typically all 15 seed concepts). */
  concepts: readonly BootstrapConcept[];
  /**
   * Override the bootstrap moment (Unix ms). Tests/backfills only; must be
   * after the user's latest event (OccurredAtNotMonotonicError otherwise).
   */
  occurredAtMs?: bigint;
};

export type BootstrapResult =
  | {
      ok: true;
      occurredAt: bigint;
      bootstrappedConceptIds: string[];
      /**
       * Concepts left as they were: no axis / sparse axis (decided before the
       * write), or already practised (decided by the fold — practice wins).
       */
      skipped: { conceptId: string; reason: 'no_axis' | 'sparse_axis' | 'already_observed' }[];
    }
  | { ok: false; error: 'ALREADY_BOOTSTRAPPED' }
  | { ok: false; error: 'NO_CONCEPTS_BOOTSTRAPPED' };

export type BootstrapServiceDeps = {
  /** Swap-in point for the future irt2plEstimator. Defaults to the ladder. */
  estimator?: ThetaEstimator;
  /** Source of "now" when occurredAtMs is not given. */
  clock?: Clock;
};

export function createBootstrapService(db: LearnerModelDb, deps: BootstrapServiceDeps = {}) {
  const estimator = deps.estimator ?? ladderEstimator;
  const clock = deps.clock ?? systemClock;

  return {
    async bootstrapFromDiagnostic(input: BootstrapInputData): Promise<BootstrapResult> {
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
        estimator: estimator.id,
        axes: axes.map((a) => ({
          axis: a.axis,
          score: a.score,
          answered: a.answered,
          ...(a.level === null ? {} : { level: a.level }),
        })),
        formulaVersion: FORMULA_VERSION,
        mappingConstants: {
          floor: MAPPING_V1.floor,
          ceiling: MAPPING_V1.ceiling,
          aboveLevelFactor: MAPPING_V1.aboveLevelFactor,
          minAnswersPerAxis: MAPPING_V1.minAnswersPerAxis,
        },
        snapshots,
      };

      const result = await db.runInTx(
        async (tx) => {
          // Strictly-once guard. Race-free only because of the user lock: two
          // concurrent diagnostics serialize here, and the second one sees the
          // first one's committed event.
          await tx.lockUser(input.userId);
          if (await tx.hasEventOfType(input.userId, 'LEARNER_BOOTSTRAPPED')) {
            return { guarded: true as const };
          }

          const occurredAt = await nextOccurredAt(tx, input.userId, clock, input.occurredAtMs);
          const event = buildLearnerBootstrappedEvent({
            userId: input.userId,
            occurredAt,
            payload,
          });
          await tx.appendEvent(event);

          // Current state of the payload's concepts, read under the lock, so the
          // fold skips exactly the concepts replay will see as practised.
          const rows = await tx.getConceptMasteries(
            input.userId,
            payload.snapshots.map((s) => s.conceptId),
          );
          const prev = new Map(rows.map((r) => [r.conceptId, rowToBktState(r)]));
          const fold = applyLearnerBootstrapped(
            payload,
            occurredAt,
            (conceptId) => prev.get(conceptId) ?? null,
          );

          // The projection writer of the LEARNER_BOOTSTRAPPED event just
          // appended: the fold's states, written as one set-based upsert (68
          // concepts per-row ran past the transaction timeout, pitfall 199). Still
          // the only way bootstrap changes ConceptMastery — through this event,
          // in its transaction — so "learner state changes only via LearnerEvent"
          // holds and replay folds the same rows (replay-equivalence DB test).
          await tx.upsertConceptMasteries(
            input.userId,
            fold.states.map((s) => ({
              conceptId: s.conceptId,
              write: bktStateToRow(s.bkt, s.stage),
            })),
          );

          return {
            guarded: false as const,
            occurredAt,
            conceptIds: fold.states.map((s) => s.conceptId),
            alreadyObserved: fold.skipped,
          };
        },
        { timeoutMs: BOOTSTRAP_TX_TIMEOUT_MS },
      );

      if (result.guarded) {
        return { ok: false, error: 'ALREADY_BOOTSTRAPPED' };
      }

      return {
        ok: true,
        occurredAt: result.occurredAt,
        bootstrappedConceptIds: result.conceptIds,
        skipped: [...skipped, ...result.alreadyObserved],
      };
    },
  };
}

export type BootstrapService = ReturnType<typeof createBootstrapService>;

/** Re-export for callers assembling the axis list. */
export type { DiagnosticAxisValue };
