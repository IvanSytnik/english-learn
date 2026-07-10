import { clampProb } from './constants';
import type { IrtParams } from './types';

/**
 * Convert pKnown ∈ (0,1) to ability θ ∈ ℝ via logit.
 * θ = ln(p / (1-p))
 *
 * Caller must ensure pKnown is already clamped (or call clampProb here).
 */
export function pKnownToTheta(pKnown: number): number {
  const p = clampProb(pKnown);
  return Math.log(p / (1 - p));
}

/** Numerically stable logistic σ(x) = 1 / (1 + e^-x). */
export function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * IRT 2PL: P(correct | known, item) = σ(a · (θ - b)).
 *
 * When item is absent, the BKT model falls back to (1 - pSlip);
 * that branching lives in `predictCorrect` / `update`, not here.
 */
export function pCorrectGivenKnown(theta: number, item: IrtParams): number {
  return clampProb(sigmoid(item.a * (theta - item.b)));
}
