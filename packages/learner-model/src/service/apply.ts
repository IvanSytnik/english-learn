import type { ItemAttemptedPayload, LearnerBootstrappedPayload } from '@englishlearn/db/schemas';
import { initBktState, update } from '../core/bkt/model';
import type { BktState } from '../core/bkt/types';
import type { FsrsCardState } from '../core/fsrs/types';
import { initCardState, reviewCard } from '../core/fsrs/wrapper';
import { type MasteryStage, nextDisplayStage } from '../mastery/stage';

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
  /** ConceptMastery.displayStage after the outcome (from stored pKnown). */
  stage: MasteryStage;
};

/**
 * The fold result plus two derived facts the live path reports back to the
 * caller (post-answer feedback). Never persisted; replay ignores them.
 */
export type ItemAttemptedFold = LearnerStatePair & {
  /** Stored pKnown just before this outcome — the prior update() starts from. */
  pKnownBefore: number;
  /** Interval FSRS granted, in days (0 for an intra-day learning step). */
  scheduledDays: number;
};

export function applyItemAttempted(
  prev: { bkt: BktState | null; fsrs: FsrsCardState | null; stage: MasteryStage | null },
  payload: ItemAttemptedPayload,
  occurredAt: bigint,
): ItemAttemptedFold {
  const atMs = Number(occurredAt);

  const bktBefore = prev.bkt ?? initBktState(atMs);
  const pKnownBefore = bktBefore.pKnown;
  const bkt = update(bktBefore, {
    correct: payload.correct,
    timestamp: atMs,
    item: { a: payload.irt.a, b: payload.irt.b },
  });

  const fsrsBefore = prev.fsrs ?? initCardState(occurredAt);
  const { state: fsrs, scheduledDays } = reviewCard(fsrsBefore, payload.rating, occurredAt);

  const stage = nextDisplayStage(prev.stage ?? 'NOT_STARTED', bkt.pKnown);

  return { bkt, fsrs, stage, pKnownBefore, scheduledDays };
}

/** One concept's initial BKT state produced by a bootstrap fold. */
export type BootstrapConceptState = {
  conceptId: string;
  bkt: BktState;
  /** Always NOT_STARTED: a diagnostic prior is not observed practice. */
  stage: MasteryStage;
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
 * bootstrap-service guarantees at most one LEARNER_BOOTSTRAPPED per user, but
 * not that it is the user's first event. Fold is pure and does not read
 * existing state, so a bootstrap after practice overwrites the practised
 * concepts' BktState. KNOWN GAP until the fold skips concepts with
 * observationCount > 0; no production caller bootstraps yet.
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
    stage: 'NOT_STARTED' as const,
  }));
}
