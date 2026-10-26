import { clampProb, THETA_KNOWN } from './constants';
import type { IrtParams } from './types';

/** Numerically stable logistic σ(x) = 1 / (1 + e^-x). */
export function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * IRT 4PL for the KNOWN state (§8 #19):
 *   P(correct | known, item) = pGuess + (1 − pSlip − pGuess) · σ(a · (θ_K − b))
 *
 * Lower asymptote pGuess (a learner who knows the concept can still only
 * guess an item far above them), upper asymptote 1 − pSlip. With
 * 1 − pSlip > pGuess the result lies strictly between pGuess and 1 − pSlip
 * for every a > 0 and b — which is exactly what keeps update() monotone:
 * a correct answer raises the posterior iff P(correct | known) > pGuess.
 *
 * θ_K is the ability of a learner who knows the concept — a constant until
 * calibration, NOT logit(pKnown): conditioning the "known" likelihood on the
 * prior that the concept is known is circular, and with b > 0 (or a cold
 * prior at b = 0) it fell below pGuess and inverted the update.
 *
 * When item is absent, the BKT model falls back to (1 - pSlip);
 * that branching lives in `predictCorrect` / `update`, not here.
 */
export function pCorrectGivenKnown(
  item: IrtParams,
  pSlip: number,
  pGuess: number,
  thetaKnown: number = THETA_KNOWN,
): number {
  return clampProb(pGuess + (1 - pSlip - pGuess) * sigmoid(item.a * (thetaKnown - item.b)));
}
