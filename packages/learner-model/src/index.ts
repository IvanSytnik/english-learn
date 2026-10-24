/**
 * @englishlearn/learner-model
 *
 * Three-layer learner state model:
 *   - Layer 3: Knowledge Graph (concepts + edges)
 *   - Layer 2: Concept Mastery (BKT+, IRT-augmented)
 *   - Layer 1: Item Memory (FSRS-based scheduling)
 *
 * This barrel only re-exports the Layer 3 (graph) primitives that are ready
 * in week 1, day 1-2. BKT, FSRS, selection, and service layers land in later days.
 */

export * as bkt from './core/bkt';
export * from './core/graph';
export * from './core/graph/types';
export * from './policy';
export * from './mastery';
export * from './rhythm';
export { createSelectionService, type SelectionService } from './service/selection-service';

// Diagnostic v2: bootstrap pipeline (pure) + write-path service.
export {
  accuracyBasedEstimator,
  axisAtPosition,
  buildBootstrapSnapshots,
  categoryToAxis,
  LADDER_AXES,
  LADDER_LEVELS,
  LADDER_START,
  type LadderAnswer,
  type LadderAxis,
  ladderAxisLevel,
  ladderEstimator,
  type LadderInput,
  type LadderLevel,
  ladderLevel,
  type LadderPoolItem,
  type LadderStep,
  LEVEL_TAIL,
  mapScoreToPKnown,
  nextLadderStep,
  QUESTIONS_PER_AXIS,
  STREAK_TO_STEP,
  TOTAL_QUESTIONS,
  MAPPING_V1,
  FORMULA_VERSION,
  type ThetaEstimator,
  type AxisEstimate,
  type BootstrapConcept,
  type ConceptCategoryValue,
  type DiagnosticAnswerFact,
  type MappingConstants,
  type BootstrapInput,
  type BootstrapOutput,
  buildPlacementReveal,
  pickStartConcept,
  type AnswerTally,
  type AxisReveal,
  type PlacementReveal,
  type PlacementRevealInput,
  type RevealAnswerFact,
  type RevealConcept,
  type RevealSkillTag,
  type StartConceptInput,
} from './diagnostic';

export {
  applyLearnerBootstrapped,
  type BootstrapConceptState,
  type BootstrapFold,
} from './service/apply';

export {
  buildLearnerBootstrappedEvent,
  parseEventRow,
  type ParsedLearnerEvent,
  type ParsedItemAttemptedEvent,
  type ParsedLearnerBootstrappedEvent,
} from './service/event-store';
