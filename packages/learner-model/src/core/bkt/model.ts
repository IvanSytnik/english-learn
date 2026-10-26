import { BKT_DEFAULTS, clampProb } from './constants';
import { applyForgetting } from './forgetting';
import { pCorrectGivenKnown } from './irt';
import type { BktOutcome, BktState, IrtParams } from './types';

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
 * Read-time forecast only — never feeds back into stored state (update()
 * does not decay; §8 #10). No production caller today.
 *
 * With item (IRT-augmented, 4PL — see pCorrectGivenKnown):
 *   P(correct) = pKnown · P(correct | known, item) + (1-pKnown) · pGuess
 * Without item (classic BKT):
 *   P(correct) = pKnown · (1-pSlip) + (1-pKnown) · pGuess
 */
export function predictCorrect(state: BktState, now: number, item?: IrtParams): number {
  const pKnownNow = applyForgetting(state.pKnown, state.pForgetLambda, now - state.lastUpdatedAt);

  const pCorrectIfKnown = item
    ? pCorrectGivenKnown(item, state.pSlip, state.pGuess)
    : 1 - state.pSlip;
  const pCorrectIfUnknown = state.pGuess;

  return clampProb(pKnownNow * pCorrectIfKnown + (1 - pKnownNow) * pCorrectIfUnknown);
}

/**
 * BKT update step. Returns a NEW state — input is not mutated.
 *
 * Algorithm:
 *  1. Bayes posterior P(known | outcome) using observation model.
 *  2. Learning transition: pKnown' = posterior + (1 - posterior) · pLearn.
 *
 * NO time decay here (decision 2026-10-20, HANDOFF §8 #10). Decaying the
 * prior toward 0 before every update (half-life ~69 h) capped day-spaced
 * practice at pKnown ≈ 0.18 — spaced learners could never reach the 0.70
 * gate while crammers could. Stored pKnown is conceptual acquisition; memory
 * decay is FSRS's job (scheduling + the isFading overlay). Forgetting stays
 * available only as a read-time forecast in predictCorrect.
 */
export function update(state: BktState, outcome: BktOutcome): BktState {
  const prior = state.pKnown;

  // Same observation model as predictCorrect. Independent of the prior, so
  // the update is monotone: correct raises the posterior, a miss lowers it.
  const pCorrectIfKnown = outcome.item
    ? pCorrectGivenKnown(outcome.item, state.pSlip, state.pGuess)
    : 1 - state.pSlip;
  const pCorrectIfUnknown = state.pGuess;

  // Bayes posterior given the observation.
  let posterior: number;
  if (outcome.correct) {
    const numerator = prior * pCorrectIfKnown;
    const denominator = numerator + (1 - prior) * pCorrectIfUnknown;
    posterior = denominator > 0 ? numerator / denominator : prior;
  } else {
    const numerator = prior * (1 - pCorrectIfKnown);
    const denominator = numerator + (1 - prior) * (1 - pCorrectIfUnknown);
    posterior = denominator > 0 ? numerator / denominator : prior;
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
export function batchUpdate(state: BktState, outcomes: ReadonlyArray<BktOutcome>): BktState {
  const sorted = [...outcomes].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.reduce(update, state);
}
