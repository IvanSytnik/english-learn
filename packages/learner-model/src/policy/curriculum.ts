import type { ConceptId } from "../core/graph/types";
import type {
  ConceptMasterySnapshot,
  PolicyConfig,
  PrereqEdge,
} from "./types";

/**
 * Prereq-aware curriculum gating (decision 3.в, 2026-07-08).
 *
 * Two regimes, split on whether the learner has already started a concept:
 *
 *  - INTRODUCTION (concept has no mastery / never attempted): HARD gate. The
 *    concept is only eligible if every PREREQUISITE ancestor is mastered
 *    (pKnown ≥ prereqThreshold). We don't drop someone into Present Perfect
 *    before Past Simple.
 *
 *  - REVIEW (concept already has a mastery snapshot): NOT gated. Once a concept
 *    has been started, its due reviews must keep flowing regardless of prereq
 *    state — otherwise a half-forgotten prereq would freeze review of things
 *    the learner already knows. FSRS scheduling owns review timing, not the gate.
 *
 * Only DIRECT prerequisites are checked. Transitivity is implied: an ancestor
 * two hops up can't be mastered unless its own prereq was, because it too had
 * to pass this gate to ever be introduced. Checking direct parents keeps this
 * O(edges) and avoids graph traversal on the hot path.
 */

export interface UnlockResult {
  /** Concepts eligible for selection this turn. */
  readonly unlocked: ReadonlySet<ConceptId>;
  /** Concepts that appear as candidates but are gated out (introduction-locked). */
  readonly locked: ReadonlySet<ConceptId>;
}

export function computeUnlocked(
  candidateConceptIds: readonly ConceptId[],
  masteries: readonly ConceptMasterySnapshot[],
  prereqEdges: readonly PrereqEdge[],
  config: PolicyConfig,
): UnlockResult {
  const masteryById = new Map<ConceptId, ConceptMasterySnapshot>();
  for (const m of masteries) masteryById.set(m.conceptId, m);

  // Direct PREREQUISITE parents of each concept (to = dependent).
  const parentsOf = new Map<ConceptId, ConceptId[]>();
  for (const e of prereqEdges) {
    if (e.kind !== "PREREQUISITE") continue;
    const arr = parentsOf.get(e.to) ?? [];
    arr.push(e.from);
    parentsOf.set(e.to, arr);
  }

  const unlocked = new Set<ConceptId>();
  const locked = new Set<ConceptId>();

  for (const conceptId of new Set(candidateConceptIds)) {
    const alreadyStarted = masteryById.has(conceptId);

    // REVIEW regime: never gated.
    if (alreadyStarted) {
      unlocked.add(conceptId);
      continue;
    }

    // INTRODUCTION regime: hard gate on direct prerequisites.
    const parents = parentsOf.get(conceptId) ?? [];
    const allParentsMastered = parents.every((parentId) => {
      const pm = masteryById.get(parentId);
      return pm !== undefined && pm.pKnown >= config.prereqThreshold;
    });

    if (allParentsMastered) unlocked.add(conceptId);
    else locked.add(conceptId);
  }

  return { unlocked, locked };
}
