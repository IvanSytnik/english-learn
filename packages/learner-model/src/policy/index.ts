/**
 * Selection policy — Layer above the three learner-model cores.
 *
 * Pure, seedable, Prisma-free. The service layer reads state from the DB port
 * and hands plain objects to `select`; nothing here does I/O.
 */

export { select } from "./select";
export { makeRng, sampleBeta, type Rng } from "./rng";
export {
  effectiveStrategy,
  rewardForOutcome,
} from "./reward";
export {
  betaParamsForConcept,
  meanDifficultyByConcept,
  priorMeanFromDifficulty,
  type BetaParams,
} from "./posterior";
export { computeUnlocked, type UnlockResult } from "./curriculum";
export {
  DEFAULT_POLICY_CONFIG,
  type ConceptEventCounts,
  type ConceptMasterySnapshot,
  type DueItem,
  type PolicyConfig,
  type PrereqEdge,
  type RewardStrategy,
  type SelectionInput,
  type SelectionOutcome,
  type SelectionReason,
  type SelectionResult,
} from "./types";
