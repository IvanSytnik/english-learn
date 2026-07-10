import type { ConceptId } from "../core/graph/types";
import { computeUnlocked } from "./curriculum";
import {
  betaParamsForConcept,
  meanDifficultyByConcept,
} from "./posterior";
import { sampleBeta, type Rng } from "./rng";
import type {
  ConceptEventCounts,
  DueItem,
  SelectionInput,
  SelectionOutcome,
  SelectionResult,
} from "./types";

/**
 * The single pure selection function.
 *
 * PRIORITY ORDER (this is the whole policy in three lines):
 *   1. REVIEW_DUE     — any unlocked, already-seen item whose FSRS dueAt ≤ now.
 *                       Scheduling beats exploration; a due card is the highest-
 *                       value thing we can show. Earliest-due wins.
 *   2. NEW_INTRODUCTION — nothing due: run Thompson Sampling over unlocked
 *                       concepts to pick what to introduce/practise next, then
 *                       pick the best item within that concept.
 *   3. EXPLORATION_FLOOR — degenerate fallback so we NEVER return empty when a
 *                       candidate exists (e.g. all dueAt in the future and the
 *                       sampled concept somehow had no item): take the globally
 *                       earliest-due unlocked item.
 *
 * Determinism: every Beta draw goes through `rng`. Same seed + same input =>
 * same result, which is what the property tests assert.
 */
export function select(input: SelectionInput, rng: Rng): SelectionOutcome {
  const { now, candidates, masteries, eventCounts, prereqEdges, config } = input;

  if (candidates.length === 0) {
    return { ok: false, error: "NO_CANDIDATES" };
  }

  // ── Gate ──────────────────────────────────────────────────────────────────
  const candidateConceptIds = candidates.map((c) => c.conceptId);
  const { unlocked } = computeUnlocked(
    candidateConceptIds,
    masteries,
    prereqEdges,
    config,
  );

  const unlockedCandidates = candidates.filter((c) =>
    unlocked.has(c.conceptId),
  );
  if (unlockedCandidates.length === 0) {
    // Everything is introduction-locked behind unmet prerequisites.
    return { ok: false, error: "NO_CANDIDATES" };
  }

  // ── 1. REVIEW_DUE ───────────────────────────────────────────────────────────
  // An item is "due" if it has a review state (dueAt !== null) and dueAt ≤ now.
  const dueNow = unlockedCandidates
    .filter((c) => c.dueAt !== null && c.dueAt <= now)
    // Non-null asserted by the filter; earliest due first, id tiebreak for determinism.
    .sort((a, b) => {
      const byDue = (a.dueAt as number) - (b.dueAt as number);
      return byDue !== 0 ? byDue : a.itemId < b.itemId ? -1 : 1;
    });

  if (dueNow.length > 0) {
    const chosen = dueNow[0] as DueItem;
    return okResult(chosen, "REVIEW_DUE", {});
  }

  // ── 2. NEW_INTRODUCTION via Thompson Sampling over unlocked concepts ─────────
  const meanDiff = meanDifficultyByConcept(unlockedCandidates);
  const countsByConcept = indexCounts(eventCounts);

  const conceptIds = uniqueConceptIds(unlockedCandidates);
  const debugScores: Record<ConceptId, number> = {};
  let bestConcept: ConceptId | null = null;
  let bestSample = Number.NEGATIVE_INFINITY;

  for (const conceptId of conceptIds) {
    const { alpha, beta } = betaParamsForConcept(
      countsByConcept.get(conceptId),
      meanDiff.get(conceptId) ?? 0,
    );
    const sample = sampleBeta(rng, alpha, beta);
    debugScores[conceptId] = sample;
    if (sample > bestSample) {
      bestSample = sample;
      bestConcept = conceptId;
    }
  }

  if (bestConcept !== null) {
    const item = pickItemInConcept(unlockedCandidates, bestConcept, now);
    if (item) return okResult(item, "NEW_INTRODUCTION", debugScores);
  }

  // ── 3. EXPLORATION_FLOOR ─────────────────────────────────────────────────────
  // Guarantee non-empty output: globally earliest-due (or any) unlocked item.
  const floor = [...unlockedCandidates].sort((a, b) => {
    const ad = a.dueAt ?? Number.POSITIVE_INFINITY;
    const bd = b.dueAt ?? Number.POSITIVE_INFINITY;
    const byDue = ad - bd;
    return byDue !== 0 ? byDue : a.itemId < b.itemId ? -1 : 1;
  })[0] as DueItem;

  return okResult(floor, "EXPLORATION_FLOOR", debugScores);
}

/**
 * Pick the best item WITHIN a chosen concept.
 *
 * Preference order:
 *   a. earliest-due seen item (even if in the future — soonest need),
 *   b. else an unseen item (dueAt === null) — a fresh introduction,
 *   c. id tiebreak for determinism.
 *
 * Item choice inside a concept is scheduling, not a bandit decision: FSRS
 * timing + "introduce something new" is a better rule than sampling per item
 * (per-item reward is too sparse — the 1.в decision).
 */
function pickItemInConcept(
  candidates: readonly DueItem[],
  conceptId: ConceptId,
  _now: number,
): DueItem | null {
  const inConcept = candidates.filter((c) => c.conceptId === conceptId);
  if (inConcept.length === 0) return null;

  const sorted = [...inConcept].sort((a, b) => {
    const ad = a.dueAt ?? Number.POSITIVE_INFINITY;
    const bd = b.dueAt ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.itemId < b.itemId ? -1 : 1;
  });
  return sorted[0] as DueItem;
}

function okResult(
  item: DueItem,
  reason: SelectionResult["reason"],
  debugScores: Record<ConceptId, number>,
): SelectionOutcome {
  return {
    ok: true,
    result: {
      itemId: item.itemId,
      conceptId: item.conceptId,
      reason,
      debugScores,
    },
  };
}

function indexCounts(
  counts: readonly ConceptEventCounts[],
): ReadonlyMap<ConceptId, ConceptEventCounts> {
  const m = new Map<ConceptId, ConceptEventCounts>();
  for (const c of counts) m.set(c.conceptId, c);
  return m;
}

function uniqueConceptIds(candidates: readonly DueItem[]): ConceptId[] {
  const seen = new Set<ConceptId>();
  const out: ConceptId[] = [];
  for (const c of candidates) {
    if (!seen.has(c.conceptId)) {
      seen.add(c.conceptId);
      out.push(c.conceptId);
    }
  }
  // Sort for deterministic Thompson iteration order (draw sequence is stable).
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
