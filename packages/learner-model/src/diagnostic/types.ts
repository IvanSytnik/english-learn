import type { CefrLevelValue, DiagnosticAxisValue } from '@englishlearn/db/schemas';

/**
 * Pure types for the diagnostic bootstrap pipeline.
 *
 * This module never touches Prisma or I/O. It turns diagnostic answers into a
 * set of initial BKT snapshots. The service layer (bootstrap-service.ts) is
 * the only thing that reads/writes the DB.
 */

/** A single graded diagnostic answer, as read from DiagnosticAnswer + item. */
export type DiagnosticAnswerFact = {
  /** Which skill axis this item measured (DiagnosticItem.kind). */
  axis: DiagnosticAxisValue;
  correct: boolean;
  /**
   * DiagnosticAnswer.dontKnow — "I don't know" (no guess). Scored as incorrect
   * regardless of `correct` (the DB CHECK already forbids dontKnow AND
   * isCorrect); still counts toward `answered`, since it is a real signal.
   */
  dontKnow?: boolean;
  /** Level of the question answered (DiagnosticAnswer.itemLevel). */
  itemLevel: CefrLevelValue;
  /** DiagnosticAnswer.position — order of the answer within the attempt. */
  position: number;
};

/**
 * A concept eligible for bootstrap, as read from Concept.
 *
 * `category` is the raw ConceptCategory. It is mapped to a diagnostic axis by
 * bootstrap.ts; categories with no axis (PHONETICS/DISCOURSE/PRAGMATICS)
 * resolve to null and are left on the selection cold-start prior (decision
 * 6.a) rather than fabricated. LISTENING maps to its axis, but with no
 * listening answers the axis is sparse and its concepts are skipped too.
 */
export type BootstrapConcept = {
  id: string;
  category: ConceptCategoryValue;
  cefrLevel: CefrLevelValue;
};

/** Mirror of Prisma ConceptCategory enum. Kept local — pure package. */
export type ConceptCategoryValue =
  | 'GRAMMAR'
  | 'VOCAB'
  | 'LISTENING'
  | 'PHONETICS'
  | 'DISCOURSE'
  | 'PRAGMATICS';

/** Per-axis ability estimate. */
export type AxisEstimate = {
  axis: DiagnosticAxisValue;
  /**
   * The formula's input, in [0,1]; 0 when answered === 0. What it measures is
   * the estimator's business: the accuracy estimator puts the fraction
   * correct here, the ladder estimator a level score (A2 0.25 … C1 1.0).
   * Never shown to the learner.
   */
  score: number;
  answered: number;
  /**
   * The axis's own assessed level, if the estimator measures one (ladder);
   * then it anchors levelFactor instead of the global assessedLevel.
   */
  level: CefrLevelValue | null;
};

/** Constants for the θ→pKnown mapping. Frozen into the event for audit. */
export type MappingConstants = {
  /** Minimum bootstrap pKnown — just above cold pKnownInit (0.1). */
  floor: number;
  /** Maximum bootstrap pKnown — never "confidently known" from diagnostic. */
  ceiling: number;
  /** Multiplier for concepts above assessedLevel (extra-conservative). */
  aboveLevelFactor: number;
  /** Below this many answers on an axis, don't trust it (leave on prior). */
  minAnswersPerAxis: number;
};
