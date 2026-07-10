/**
 * Graph traversal — pure read-only operations on a `ConceptGraph`.
 *
 * Semantics of edge directions:
 *
 *   PREREQUISITE: from = prerequisite, to = dependent
 *     "Past Participle" --PREREQUISITE--> "Present Perfect"
 *     means: Present Perfect requires Past Participle.
 *     -> getPrerequisites("present_perfect") = ["past_participle", ...]
 *     -> getDependents("past_participle")    = ["present_perfect", ...]
 *
 *   RELATED:        symmetric in spirit; we still store one direction.
 *                   Use getRelated() which follows both incoming/outgoing.
 *
 *   CONTRASTS_WITH: symmetric in spirit (Present Perfect <-> Past Simple).
 *                   Use getContrasts() which follows both directions.
 *
 *   PART_OF: from = part, to = whole
 *     "vocab.travel.airport" --PART_OF--> "vocab.travel"
 *     -> getParts("vocab.travel") = ["vocab.travel.airport", ...]
 *     -> getWhole("vocab.travel.airport") = ["vocab.travel"]
 */

import type { ConceptEdge, ConceptGraph, ConceptId, EdgeKind } from './types';

// -----------------------------------------------------------------------------
// Direct neighbors (1 hop)
// -----------------------------------------------------------------------------

function outgoingOf(graph: ConceptGraph, id: ConceptId, kind: EdgeKind): readonly ConceptEdge[] {
  return (graph.outgoing.get(id) ?? []).filter((e) => e.kind === kind);
}

function incomingOf(graph: ConceptGraph, id: ConceptId, kind: EdgeKind): readonly ConceptEdge[] {
  return (graph.incoming.get(id) ?? []).filter((e) => e.kind === kind);
}

/** Concepts that `id` directly requires. */
export function getPrerequisites(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return incomingOf(graph, id, 'PREREQUISITE').map((e) => e.from);
}

/** Concepts that directly require `id`. */
export function getDependents(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return outgoingOf(graph, id, 'PREREQUISITE').map((e) => e.to);
}

/** Symmetric neighbors via RELATED edges (in OR out). */
export function getRelated(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  const out = outgoingOf(graph, id, 'RELATED').map((e) => e.to);
  const inc = incomingOf(graph, id, 'RELATED').map((e) => e.from);
  return Array.from(new Set([...out, ...inc]));
}

/** Symmetric neighbors via CONTRASTS_WITH (e.g., Present Perfect vs Past Simple). */
export function getContrasts(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  const out = outgoingOf(graph, id, 'CONTRASTS_WITH').map((e) => e.to);
  const inc = incomingOf(graph, id, 'CONTRASTS_WITH').map((e) => e.from);
  return Array.from(new Set([...out, ...inc]));
}

/** Sub-parts of a whole. */
export function getParts(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return incomingOf(graph, id, 'PART_OF').map((e) => e.from);
}

/** Whole(s) that this concept is a part of. */
export function getWhole(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return outgoingOf(graph, id, 'PART_OF').map((e) => e.to);
}

// -----------------------------------------------------------------------------
// Transitive closures
// -----------------------------------------------------------------------------

/**
 * All concepts that `id` requires (recursively).
 * Returns in topological order (deepest prerequisites first).
 */
export function getAllPrerequisites(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return reverseTopoBfs(graph, id, (node) => getPrerequisites(graph, node));
}

/** All concepts that depend on `id` (recursively). */
export function getAllDependents(graph: ConceptGraph, id: ConceptId): ConceptId[] {
  return reverseTopoBfs(graph, id, (node) => getDependents(graph, node));
}

function reverseTopoBfs(
  graph: ConceptGraph,
  start: ConceptId,
  next: (id: ConceptId) => ConceptId[],
): ConceptId[] {
  if (!graph.concepts.has(start)) return [];
  const seen = new Set<ConceptId>();
  const result: ConceptId[] = [];
  const queue: ConceptId[] = [...next(start)];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    result.push(node);
    queue.push(...next(node));
  }
  return result;
}

// -----------------------------------------------------------------------------
// Propagation
// -----------------------------------------------------------------------------

/**
 * Compute decay weights for propagating evidence along PREREQUISITE edges.
 *
 * When a learner answers correctly on concept X at high difficulty, that's
 * partial evidence that prerequisites of X are also known. Conversely, a
 * failure on X provides partial evidence about prerequisites.
 *
 * This function returns the weight assigned to each (transitive) prerequisite,
 * decaying with distance: weight = decay^depth.
 *
 * The caller (BKT update layer, Week 1 Day 3-4) is responsible for applying
 * these weights to evidence updates. This module knows nothing about BKT.
 *
 * @param decay  per-hop decay factor in (0, 1). Default 0.5.
 * @returns map from prerequisite ConceptId -> weight in (0, 1]
 */
export function propagationWeights(
  graph: ConceptGraph,
  origin: ConceptId,
  decay = 0.5,
): Map<ConceptId, number> {
  if (decay <= 0 || decay >= 1) {
    throw new Error(`decay must be in (0, 1), got ${decay}`);
  }
  const weights = new Map<ConceptId, number>();
  if (!graph.concepts.has(origin)) return weights;

  type Frame = { id: ConceptId; depth: number };
  const queue: Frame[] = getPrerequisites(graph, origin).map((id) => ({
    id,
    depth: 1,
  }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const w = decay ** depth;
    // Keep the largest weight (shortest path).
    const existing = weights.get(id);
    if (existing === undefined || w > existing) {
      weights.set(id, w);
      for (const pre of getPrerequisites(graph, id)) {
        queue.push({ id: pre, depth: depth + 1 });
      }
    }
  }
  return weights;
}

// -----------------------------------------------------------------------------
// Topological sort
// -----------------------------------------------------------------------------

/**
 * Topological sort of all concepts by PREREQUISITE order (Kahn's algorithm).
 * Items with no prerequisites come first.
 *
 * Throws if the PREREQUISITE subgraph has a cycle. (`buildGraph` already
 * prevents this; this is defensive.)
 */
export function topologicalOrder(graph: ConceptGraph): ConceptId[] {
  const inDegree = new Map<ConceptId, number>();
  for (const id of graph.concepts.keys()) {
    inDegree.set(id, getPrerequisites(graph, id).length);
  }

  const queue: ConceptId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: ConceptId[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const dep of getDependents(graph, node)) {
      const d = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }

  if (result.length !== graph.concepts.size) {
    throw new Error('Topological sort failed: PREREQUISITE subgraph has a cycle');
  }
  return result;
}
