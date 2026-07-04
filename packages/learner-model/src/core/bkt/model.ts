import { BKT_DEFAULTS, clampProb } from "./constants";
import { applyForgetting } from "./forgetting";
import { pCorrectGivenKnown, pKnownToTheta } from "./irt";
import type { BktOutcome, BktState, IrtParams } from "./types";

/**
 * Create a fresh BKT state with global defaults.
 *
 * Use when a (user, concept) pair has no ConceptMastery row yet.
 */
export function initBktState(at: number): BktState {
  return {
    pKnown: BKT_DEFAULTS.pKnownInit,
    pLearn: BKT_DEFAULTS.pLearn,
    pSlip: BKT_DEFAULTS.pSlip,
    pGuess: BKT_DEFAULTS.pGuess,
    pForgetLambda: BKT_DEFAULTS.pForgetLambda,
    lastUpdatedAt: at,
    observationCount: 0,
  };
}

/**
 * Predict P(correct) for an upcoming attempt, AFTER applying forgetting.
 *
 * With item (IRT-augmented):
 *   P(correct) = pKnown · σ(a(θ-b)) + (1-pKnown) · pGuess
 * Without item (classic BKT):
 *   P(correct) = pKnown · (1-pSlip) + (1-pKnown) · pGuess
 */
export function predictCorrect(
  state: BktState,
  now: number,
  item?: IrtParams,
): number {
  const pKnownNow = applyForgetting(
    state.pKnown,
    state.pForgetLambda,
    now - state.lastUpdatedAt,
  );

  const pCorrectIfKnown = item
    ? pCorrectGivenKnown(pKnownToTheta(pKnownNow), item)
    : 1 - state.pSlip;
  const pCorrectIfUnknown = state.pGuess;

  return clampProb(
    pKnownNow * pCorrectIfKnown + (1 - pKnownNow) * pCorrectIfUnknown,
  );
}

/**
 * BKT update step. Returns a NEW state — input is not mutated.
 *
 * Algorithm:
 *  1. Apply forgetting: pKnown@outcome.timestamp = pKnown · exp(-λΔt).
 *  2. Bayes posterior P(known | outcome) using observation model.
 *  3. Learning transition: pKnown' = posterior + (1 - posterior) · pLearn.
 */
export function update(state: BktState, outcome: BktOutcome): BktState {
  const decayedPKnown = applyForgetting(
    state.pKnown,
    state.pForgetLambda,
    outcome.timestamp - state.lastUpdatedAt,
  );

  const pCorrectIfKnown = outcome.item
    ? pCorrectGivenKnown(pKnownToTheta(decayedPKnown), outcome.item)
    : 1 - state.pSlip;
  const pCorrectIfUnknown = state.pGuess;

  // Bayes posterior given the observation.
  let posterior: number;
  if (outcome.correct) {
    const numerator = decayedPKnown * pCorrectIfKnown;
    const denominator =
      numerator + (1 - decayedPKnown) * pCorrectIfUnknown;
    posterior = denominator > 0 ? numerator / denominator : decayedPKnown;
  } else {
    const numerator = decayedPKnown * (1 - pCorrectIfKnown);
    const denominator =
      numerator + (1 - decayedPKnown) * (1 - pCorrectIfUnknown);
    posterior = denominator > 0 ? numerator / denominator : decayedPKnown;
  }

  // Learning transition.
  const pKnownNext = posterior + (1 - posterior) * state.pLearn;

  return {
    ...state,
    pKnown: clampProb(pKnownNext),
    lastUpdatedAt: outcome.timestamp,
    observationCount: state.observationCount + 1,
  };
}

/**
 * Fold a sequence of outcomes left-to-right.
 *
 * Sorts by timestamp defensively — callers may pass unordered events
 * (e.g., from EventStore replay). Equivalent to sequential `update` calls
 * on a sorted input — verified by property-based test.
 */
export function batchUpdate(
  state: BktState,
  outcomes: ReadonlyArray<BktOutcome>,
): BktState {
  const sorted = [...outcomes].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.reduce(update, state);
}