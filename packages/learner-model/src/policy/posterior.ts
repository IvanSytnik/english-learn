import type { ConceptId } from '../core/graph/types';
import type { ConceptEventCounts, DueItem } from './types';

/**
 * Beta posterior construction for Thompson Sampling.
 *
 * Each concept is an arm with a Beta(α, β) belief over "success rate". Success
 * is a correct attempt (bernoulli reward — the active strategy). Posterior:
 *
 *   α = priorAlpha + #correct
 *   β = priorBeta  + #incorrect
 *
 * COLD START (грабля risk from the plan): a naive uniform prior Beta(1,1) gives
 * an unseen concept maximum variance, so the bandit explores it aggressively
 * and the learner sees chaotic output. Instead we derive an INFORMATIVE prior
 * from the concept's mean IRT difficulty: harder concepts start with a lower
 * expected success rate. The prior is weak (small pseudo-count) so real
 * evidence dominates quickly.
 */

export interface BetaParams {
  readonly alpha: number;
  readonly beta: number;
}

/**
 * Total pseudo-count of the cold-start prior. Small so ~a handful of real
 * attempts outweigh it. 2 => at most Beta(≈2, ≈2)-ish before any data.
 */
const PRIOR_STRENGTH = 2;

/** Keep prior mean strictly inside (0,1) so both α,β stay > 0. */
const PRIOR_MEAN_FLOOR = 0.1;
const PRIOR_MEAN_CEIL = 0.9;

/**
 * Informative prior mean for a concept from the mean IRT difficulty `b` of its
 * candidate items. We map difficulty to an expected success rate for a
 * "typical" learner (θ = 0) via the 2PL success curve at θ=0: σ(-b) with a=1.
 *
 * b < 0 (easy)  => mean > 0.5   (expect success)
 * b > 0 (hard)  => mean < 0.5   (expect struggle)
 */
export function priorMeanFromDifficulty(meanDifficulty: number): number {
  const raw = 1 / (1 + Math.exp(meanDifficulty)); // σ(-b) at θ=0, a=1
  return clamp(raw, PRIOR_MEAN_FLOOR, PRIOR_MEAN_CEIL);
}

/**
 * Build Beta params for a concept.
 *
 * @param counts        historical correct/incorrect for this concept (may be absent)
 * @param meanDifficulty mean IRT b across the concept's candidate items
 */
export function betaParamsForConcept(
  counts: ConceptEventCounts | undefined,
  meanDifficulty: number,
): BetaParams {
  const mean = priorMeanFromDifficulty(meanDifficulty);
  const priorAlpha = PRIOR_STRENGTH * mean;
  const priorBeta = PRIOR_STRENGTH * (1 - mean);

  const correct = counts?.correct ?? 0;
  const incorrect = counts?.incorrect ?? 0;

  return {
    alpha: priorAlpha + correct,
    beta: priorBeta + incorrect,
  };
}

/**
 * Mean IRT difficulty across a concept's candidate items. Empty => 0 (neutral),
 * which yields a prior mean of 0.5.
 */
export function meanDifficultyByConcept(
  candidates: readonly DueItem[],
): ReadonlyMap<ConceptId, number> {
  const sums = new Map<ConceptId, { sum: number; n: number }>();
  for (const c of candidates) {
    const acc = sums.get(c.conceptId) ?? { sum: 0, n: 0 };
    acc.sum += c.irtDifficulty;
    acc.n += 1;
    sums.set(c.conceptId, acc);
  }
  const out = new Map<ConceptId, number>();
  for (const [conceptId, { sum, n }] of sums) {
    out.set(conceptId, n > 0 ? sum / n : 0);
  }
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
