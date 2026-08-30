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
};

/**
 * A concept eligible for bootstrap, as read from Concept.
 *
 * `category` is the raw ConceptCategory. It is mapped to a diagnostic axis by
 * bootstrap.ts; categories with no axis (PHONETICS/DISCOURSE/PRAGMATICS/
 * LISTENING-with-no-items) resolve to null and are left on the selection
 * cold-start prior (decision 6.a) rather than fabricated.
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
  /** Fraction correct on this axis, in [0,1]. 0 when answered === 0. */
  accuracy: number;
  answered: number;
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
