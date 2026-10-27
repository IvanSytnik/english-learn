/**
 * Selection policy — Layer above the three learner-model cores.
 *
 * Pure, seedable, Prisma-free. The service layer reads state from the DB port
 * and hands plain objects to `select`; nothing here does I/O.
 */

export {
  computeUnlocked,
  type GateMastery,
  isMastered,
  type UnlockResult,
} from './curriculum';
export {
  type LevelGuardConfig,
  type LevelGuardInput,
  type LevelGuardOutcome,
  type LevelGuardResult,
  levelGuard,
} from './level-guard';
export { levelPriorMean } from './level-score';
export {
  type BetaParams,
  betaParamsForConcept,
  meanDifficultyByConcept,
  priorMeanFromDifficulty,
} from './posterior';
export {
  effectiveStrategy,
  rewardForOutcome,
} from './reward';
export { makeRng, type Rng, sampleBeta, seedFromString } from './rng';
export { select } from './select';
export {
  type ConceptEventCounts,
  type ConceptMasterySnapshot,
  DEFAULT_POLICY_CONFIG,
  type DueItem,
  type LevelPolicyConfig,
  type PolicyConfig,
  type PrereqEdge,
  type RewardStrategy,
  type SelectionInput,
  type SelectionOutcome,
  type SelectionReason,
  type SelectionResult,
} from './types';
