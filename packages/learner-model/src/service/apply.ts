import type { ItemAttemptedPayload, LearnerBootstrappedPayload } from '@englishlearn/db/schemas';
import { initBktState, update } from '../core/bkt/model';
import type { BktState } from '../core/bkt/types';
import type { FsrsCardState } from '../core/fsrs/types';
import { initCardState, reviewCard } from '../core/fsrs/wrapper';

/**
 * The ONE pure fold step shared by the live path (recordOutcome) and replay.
 *
 * Bit-exact replay is guaranteed by construction: both paths call this exact
 * function with the exact same inputs (the frozen event payload + occurredAt),
 * so there is no second implementation to drift.
 *
 * Timestamp discipline: `occurredAt` (bigint ms) is used for BOTH cores —
 * Number(occurredAt) for BKT, occurredAt as-is for FSRS. Never call
 * Date.now() below this line.
 */

export type LearnerStatePair = {
  bkt: BktState;
  fsrs: FsrsCardState;
};

export function applyItemAttempted(
  prev: { bkt: BktState | null; fsrs: FsrsCardState | null },
  payload: ItemAttemptedPayload,
  occurredAt: bigint,
): LearnerStatePair {
  const atMs = Number(occurredAt);

  const bktBefore = prev.bkt ?? initBktState(atMs);
  const bkt = update(bktBefore, {
    correct: payload.correct,
    timestamp: atMs,
    item: { a: payload.irt.a, b: payload.irt.b },
  });

  const fsrsBefore = prev.fsrs ?? initCardState(occurredAt);
  const { state: fsrs } = reviewCard(fsrsBefore, payload.rating, occurredAt);

  return { bkt, fsrs };
}

/** One concept's initial BKT state produced by a bootstrap fold. */
export type BootstrapConceptState = {
  conceptId: string;
  bkt: BktState;
};

/**
 * Fold a LEARNER_BOOTSTRAPPED event into a set of initial ConceptMastery
 * states.
 *
 * Unlike applyItemAttempted this touches ONLY the BKT layer, and produces N
 * states (one per snapshot in the payload) rather than a single pair — there
 * are no items, hence no FSRS state, at bootstrap time.
 *
 * The snapshot is taken verbatim from the frozen payload; the mapping formula
 * is NOT re-run here (it already ran in the diagnostic module before the event
 * was written). This is what makes replay reproducible across formula versions:
 * we persist the frozen result, we don't recompute it. The only value fold sets
 * is lastUpdatedAt = occurredAt, so forgetting decay is anchored correctly.
 *
 * Precondition (enforced by bootstrap-service, not here): this is the user's
 * FIRST event, so every concept in the payload has no prior BktState. Fold is
 * pure and does not read existing state — a stray second bootstrap would blindly
 * overwrite, which is exactly why the service guards strictly-once.
 */
export function applyLearnerBootstrapped(
  payload: LearnerBootstrappedPayload,
  occurredAt: bigint,
): BootstrapConceptState[] {
  const atMs = Number(occurredAt);

  return payload.snapshots.map((s) => ({
    conceptId: s.conceptId,
    bkt: {
      pKnown: s.pKnown,
      pLearn: s.pLearn,
      pSlip: s.pSlip,
      pGuess: s.pGuess,
      pForgetLambda: s.pForgetLambda,
      lastUpdatedAt: atMs,
      observationCount: 0,
    },
  }));
}
