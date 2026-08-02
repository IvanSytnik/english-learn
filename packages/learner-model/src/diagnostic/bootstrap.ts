import type {
  BootstrapConceptSnapshot,
  CefrLevelValue,
  DiagnosticAxisValue,
} from '@englishlearn/db/schemas';
import { clampProb } from '../core/bkt/constants';
import { initBktState } from '../core/bkt/model';
import type {
  AxisEstimate,
  BootstrapConcept,
  ConceptCategoryValue,
  MappingConstants,
} from './types';

/**
 * θ→pKnown mapping (formula v1, decision 9.a).
 *
 * These constants are deliberately CONSERVATIVE. The diagnostic is a coarse
 * instrument on uncalibrated items; over-crediting a concept (high pKnown)
 * hides a real gap because the selection policy then serves less of it. The
 * asymmetry is intentional: under-crediting costs one extra review; over-
 * crediting costs a missed weakness. So we cap hard at `ceiling` and never let
 * the diagnostic mark a concept "confidently known" — the first real
 * recordOutcome refines it via BKT anyway.
 *
 * FROZEN into the LEARNER_BOOTSTRAPPED payload (mappingConstants + formula
 * version). Replay reads the computed snapshots, not this constant, so
 * changing v1→v2 here never rewrites history.
 */
export const MAPPING_V1: MappingConstants = {
  floor: 0.15, // just above cold pKnownInit (0.1): diagnostic ran, we know *something*
  ceiling: 0.6, // hard cap: never "confidently known" from a diagnostic
  aboveLevelFactor: 0.5, // concepts above assessedLevel: twice as conservative
  minAnswersPerAxis: 3, // sparse-pool guard (R4): fewer answers → don't trust the axis
} as const;

export const FORMULA_VERSION = 'v1' as const;

/** CEFR ordering for the levelFactor comparison. */
const CEFR_RANK: Record<CefrLevelValue, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

/**
 * Map a ConceptCategory to the diagnostic axis that measures it.
 *
 * GRAMMAR and VOCAB have direct axes. LISTENING category *would* map to the
 * LISTENING axis, but is included here for completeness. Categories with no
 * diagnostic signal (PHONETICS/DISCOURSE/PRAGMATICS) return null → the concept
 * is left on the selection cold-start prior (decision 6.a), NOT fabricated.
 *
 * Total over the enum by construction: adding a category without an axis is a
 * compile error only if the caller switches exhaustively; here we default to
 * null, which is the safe "leave on prior" branch.
 */
export function categoryToAxis(category: ConceptCategoryValue): DiagnosticAxisValue | null {
  switch (category) {
    case 'GRAMMAR':
      return 'GRAMMAR';
    case 'VOCAB':
      return 'VOCAB';
    case 'LISTENING':
      return 'LISTENING';
    case 'PHONETICS':
    case 'DISCOURSE':
    case 'PRAGMATICS':
      return null;
    default: {
      // Exhaustiveness guard: if ConceptCategory gains a member, TS flags this.
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

/**
 * The v1 mapping formula. Pure arithmetic, isolated for unit testing.
 *
 *   pKnown = clamp(
 *     floor + accuracy · (ceiling − floor) · levelFactor,
 *     floor, ceiling
 *   )
 *
 * levelFactor = 1.0 if the concept is at or below assessedLevel, else
 * aboveLevelFactor (a B1 concept for an A2 learner is almost certainly not yet
 * acquired, so we discount it).
 */
export function mapAccuracyToPKnown(
  accuracy: number,
  conceptLevel: CefrLevelValue,
  assessedLevel: CefrLevelValue,
  c: MappingConstants,
): number {
  const levelFactor = CEFR_RANK[conceptLevel] <= CEFR_RANK[assessedLevel] ? 1.0 : c.aboveLevelFactor;
  const raw = c.floor + accuracy * (c.ceiling - c.floor) * levelFactor;
  // clampProb guards NaN; the explicit ceiling/floor clamp enforces policy.
  return Math.min(c.ceiling, Math.max(c.floor, clampProb(raw)));
}

/**
 * Build the full initial BKT snapshot for one concept at pKnown.
 *
 * Uses initBktState for the canonical BKT_DEFAULTS (single source of truth for
 * pLearn/pSlip/pGuess/pForgetLambda), then overrides ONLY pKnown. observation-
 * Count stays 0: bootstrap is a starting point, not observed practice, so
 * forgetting decay and calibration treat it correctly as "no evidence yet".
 */
function snapshotForConcept(
  conceptId: string,
  pKnown: number,
  sourceAxis: DiagnosticAxisValue | null,
): BootstrapConceptSnapshot {
  const base = initBktState(0); // timestamp is set at persist time by fold, not here
  return {
    conceptId,
    pKnown,
    pLearn: base.pLearn,
    pSlip: base.pSlip,
    pGuess: base.pGuess,
    pForgetLambda: base.pForgetLambda,
    sourceAxis,
  };
}

export type BootstrapInput = {
  concepts: readonly BootstrapConcept[];
  axes: readonly AxisEstimate[];
  assessedLevel: CefrLevelValue;
  constants?: MappingConstants;
};

export type BootstrapOutput = {
  snapshots: BootstrapConceptSnapshot[];
  /** Concepts intentionally left on the prior (no axis, or sparse axis). */
  skipped: { conceptId: string; reason: 'no_axis' | 'sparse_axis' }[];
};

/**
 * Turn per-axis estimates into per-concept initial snapshots.
 *
 * For each concept:
 *   1. Resolve its diagnostic axis from category. null axis → skip (6.a).
 *   2. If the axis has < minAnswersPerAxis answers → skip (R4 sparse guard):
 *      a noisy estimate from 1-2 answers is worse than the informative prior
 *      the selection policy already applies to un-bootstrapped concepts.
 *   3. Otherwise map accuracy → pKnown (conservative v1) → full snapshot.
 *
 * Skipped concepts get NO ConceptMastery row — selection's cold-start prior
 * handles them. This keeps the payload honest: we only assert mastery we
 * actually measured.
 */
export function buildBootstrapSnapshots(input: BootstrapInput): BootstrapOutput {
  const c = input.constants ?? MAPPING_V1;

  const axisByName = new Map<DiagnosticAxisValue, AxisEstimate>();
  for (const a of input.axes) axisByName.set(a.axis, a);

  const snapshots: BootstrapConceptSnapshot[] = [];
  const skipped: BootstrapOutput['skipped'] = [];

  for (const concept of input.concepts) {
    const axis = categoryToAxis(concept.category);
    if (axis === null) {
      skipped.push({ conceptId: concept.id, reason: 'no_axis' });
      continue;
    }

    const estimate = axisByName.get(axis);
    if (!estimate || estimate.answered < c.minAnswersPerAxis) {
      skipped.push({ conceptId: concept.id, reason: 'sparse_axis' });
      continue;
    }

    const pKnown = mapAccuracyToPKnown(
      estimate.accuracy,
      concept.cefrLevel,
      input.assessedLevel,
      c,
    );
    snapshots.push(snapshotForConcept(concept.id, pKnown, axis));
  }

  return { snapshots, skipped };
}
