/**
 * Global BKT defaults.
 *
 * Starting values used when a Concept does not override them.
 * Calibrate from LearnerEvent once we have ≥500 outcomes per concept.
 *
 * References:
 * - Corbett & Anderson (1995): pSlip ≤ 0.10, pGuess ≤ 0.30 to avoid degeneracy
 * - BKT+ (Yudelson 2013): per-user pLearn improves fit
 */
export const BKT_DEFAULTS = {
  /** Prior probability concept is known before any practice. */
  pKnownInit: 0.1,
  /** Probability of transitioning unknown → known per attempt. */
  pLearn: 0.1,
  /** Probability of incorrect answer when concept IS known. */
  pSlip: 0.1,
  /** Probability of correct answer when concept is NOT known. */
  pGuess: 0.25,
  /** Forgetting rate λ per hour (exponential decay). λ=0.01/h ≈ half-life ~69h. */
  pForgetLambda: 0.01,
} as const;

/** Numerical safety bounds — clamp probabilities away from absorbing 0/1. */
export const PROB_EPSILON = 1e-6;
export const PROB_MIN = PROB_EPSILON;
export const PROB_MAX = 1 - PROB_EPSILON;

/**
 * Clamp a probability into [PROB_MIN, PROB_MAX].
 * Throws on NaN — NaN here always indicates a bug upstream.
 */
export function clampProb(p: number): number {
  if (!Number.isFinite(p)) {
    throw new Error(`clampProb: expected finite number, got ${p}`);
  }
  if (p < PROB_MIN) return PROB_MIN;
  if (p > PROB_MAX) return PROB_MAX;
  return p;
}
