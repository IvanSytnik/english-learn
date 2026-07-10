import type { PolicyConfig, RewardStrategy } from './types';

/**
 * Reward computation for the bandit.
 *
 * DESIGN (decision 2026-07-08): learning_gain is the target reward, but it is
 * only trustworthy once BKT params are calibrated. Until a concept has seen
 * ≥ calibrationGate outcomes, the effective strategy is forced to "bernoulli".
 * This turns "when do we switch?" from a vibe into a measurable trigger.
 *
 * These functions are pure and side-effect free. They are consumed by the
 * posterior builder (to translate historical outcomes into Beta evidence) and
 * will later be consumed by the eval harness.
 */

/**
 * Resolve the STRATEGY THAT ACTUALLY APPLIES for a concept, given how much
 * evidence it has. Below the gate, gain/hybrid degrade to bernoulli.
 */
export function effectiveStrategy(config: PolicyConfig, observationCount: number): RewardStrategy {
  if (config.strategy === 'bernoulli') return 'bernoulli';
  if (observationCount < config.calibrationGate) return 'bernoulli';
  return config.strategy;
}

/**
 * Map a single completed attempt to reward in [0,1].
 *
 * @param correct     did the learner get it right
 * @param pKnownBefore pKnown at attempt time (pre-update)
 * @param pKnownAfter  pKnown after the BKT update
 * @param strategy     the EFFECTIVE strategy (already gate-resolved)
 * @param hybridGainWeight blend weight for hybrid
 */
export function rewardForOutcome(
  correct: boolean,
  pKnownBefore: number,
  pKnownAfter: number,
  strategy: RewardStrategy,
  hybridGainWeight: number,
): number {
  const bernoulli = correct ? 1 : 0;

  switch (strategy) {
    case 'bernoulli':
      return bernoulli;
    case 'learning_gain':
      return clamp01(pKnownAfter - pKnownBefore);
    case 'hybrid': {
      const gain = clamp01(pKnownAfter - pKnownBefore);
      const w = clamp01(hybridGainWeight);
      return clamp01(w * gain + (1 - w) * bernoulli);
    }
  }
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) {
    // Match the codebase's clampProb philosophy: surface NaN, never mask it.
    throw new RangeError('reward is NaN');
  }
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
