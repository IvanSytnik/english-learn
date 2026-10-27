import { BKT_DEFAULTS } from '../core/bkt/constants';
import { type Rng, sampleBeta } from './rng';
import type { ConceptEventCounts, LevelPolicyConfig } from './types';

/**
 * V6b concept score (§8 #19 stage 2) — the formula is documented on
 * LevelPolicyConfig. Ranks are CEFR ranks (core/graph CEFR_RANK); only
 * differences matter.
 */

const MEAN_FLOOR = 0.1;
const MEAN_CEIL = 0.9;

/** Predicted success μ(θ, r) of a concept at rank r for a learner at θ. */
export function levelPriorMean(theta: number, rank: number, cfg: LevelPolicyConfig): number {
  const { pGuess, pSlip } = BKT_DEFAULTS;
  const raw = pGuess + (1 - pSlip - pGuess) * sigmoid(cfg.k * (theta - rank) + cfg.c0);
  return Math.min(MEAN_CEIL, Math.max(MEAN_FLOOR, raw));
}

/** One Beta draw for the concept, scored against the target level. */
export function levelScore(
  rng: Rng,
  rank: number,
  theta: number,
  targetRank: number,
  counts: ConceptEventCounts | undefined,
  cfg: LevelPolicyConfig,
): number {
  const mean = levelPriorMean(theta, rank, cfg);
  const s = sampleBeta(
    rng,
    cfg.strength * mean + (counts?.correct ?? 0),
    cfg.strength * (1 - mean) + (counts?.incorrect ?? 0),
  );
  const pStar = levelPriorMean(theta, targetRank, cfg);
  return -Math.abs(s - pStar) - cfg.lambda * Math.abs(rank - targetRank);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
