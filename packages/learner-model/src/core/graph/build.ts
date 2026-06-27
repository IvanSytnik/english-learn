/**
 * Graph builder & validation.
 *
 * `buildGraph` is the only sanctioned way to construct a `ConceptGraph`.
 * It validates input via Zod, enforces structural invariants, and throws
 * with a precise reason on failure.
 *
 * Invariants enforced:
 *   1. All concept IDs are valid per ConceptIdSchema.
 *   2. No duplicate concept IDs.
 *   3. Every edge endpoint references a known concept.
 *   4. No self-loops (also caught by ConceptEdgeSchema).
 *   5. No duplicate (from, to, kind) edges.
 *   6. PREREQUISITE edges form a DAG (no cycles).
 *      Other edge kinds may form cycles (RELATED/CONTRASTS_WITH are symmetric in spirit).
 *   7. PREREQUISITE direction is "from prerequisite -> to dependent":
 *      `to` requires `from`. So traversing PREREQUISITE outgoing from a
 *      concept yields what *depends on* it; incoming yields what *it requires*.
 *      (See graph.ts for traversal helpers.)
 */

import {
  type Concept,
  type ConceptEdge,
  type ConceptGraph,
  type ConceptId,
  ConceptEdgeSchema,
  ConceptSchema,
} from "./types";

export class GraphValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_CONCEPT"
      | "INVALID_EDGE"
      | "DUPLICATE_CONCEPT"
      | "DUPLICATE_EDGE"
      | "UNKNOWN_CONCEPT_REF"
      | "PREREQUISITE_CYCLE",
  ) {
    super(message);
    this.name = "GraphValidationError";
  }
}

export interface BuildGraphInput {
  concepts: readonly Concept[];
  edges: readonly ConceptEdge[];
}

export function buildGraph(input: BuildGraphInput): ConceptGraph {
  // 1. Validate concepts individually.
  const conceptMap = new Map<ConceptId, Concept>();
  for (const raw of input.concepts) {
    const parsed = ConceptSchema.parse(raw);
    if (conceptMap.has(parsed.id)) {
      throw new GraphValidationError(
        `Duplicate concept id: ${parsed.id}`,
        "DUPLICATE_CONCEPT",
      );
    }
    conceptMap.set(parsed.id, parsed);
  }

  // 2. Validate edges individually + endpoint existence + dedupe.
  const outgoing = new Map<ConceptId, ConceptEdge[]>();
  const incoming = new Map<ConceptId, ConceptEdge[]>();
  const edgeKey = (e: ConceptEdge) => `${e.from}>${e.kind}>${e.to}`;
  const seenEdges = new Set<string>();
  const edges: ConceptEdge[] = [];

  for (const raw of input.edges) {
    const parsed = ConceptEdgeSchema.parse(raw);
    if (!conceptMap.has(parsed.from)) {
      throw new GraphValidationError(
        `Edge references unknown concept: ${parsed.from}`,
        "UNKNOWN_CONCEPT_REF",
      );
    }
    if (!conceptMap.has(parsed.to)) {
      throw new GraphValidationError(
        `Edge references unknown concept: ${parsed.to}`,
        "UNKNOWN_CONCEPT_REF",
      );
    }
    const key = edgeKey(parsed);
    if (seenEdges.has(key)) {
      throw new GraphValidationError(
        `Duplicate edge: ${key}`,
        "DUPLICATE_EDGE",
      );
    }
    seenEdges.add(key);
    edges.push(parsed);

    const out = outgoing.get(parsed.from) ?? [];
    out.push(parsed);
    outgoing.set(parsed.from, out);

    const inc = incoming.get(parsed.to) ?? [];
    inc.push(parsed);
    incoming.set(parsed.to, inc);
  }

  // 3. PREREQUISITE acyclicity (DFS-based cycle detection).
  assertPrerequisiteDag(conceptMap, outgoing);

  // 4. Freeze.
  const freezeArrayMap = (
    m: Map<ConceptId, ConceptEdge[]>,
  ): ReadonlyMap<ConceptId, readonly ConceptEdge[]> => {
    const frozen = new Map<ConceptId, readonly ConceptEdge[]>();
    for (const [k, v] of m) frozen.set(k, Object.freeze([...v]));
    return frozen;
  };

  return {
    concepts: conceptMap,
    edges: Object.freeze([...edges]),
    outgoing: freezeArrayMap(outgoing),
    incoming: freezeArrayMap(incoming),
  };
}

function assertPrerequisiteDag(
  concepts: ReadonlyMap<ConceptId, Concept>,
  outgoing: ReadonlyMap<ConceptId, readonly ConceptEdge[]>,
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<ConceptId, number>();
  for (const id of concepts.keys()) color.set(id, WHITE);

  const stack: ConceptId[] = [];

  const visit = (node: ConceptId): void => {
    color.set(node, GRAY);
    const out = outgoing.get(node) ?? [];
    for (const edge of out) {
      if (edge.kind !== "PREREQUISITE") continue;
      const next = edge.to;
      const c = color.get(next);
      if (c === GRAY) {
        stack.push(next);
        const cycle = [...stack];
        throw new GraphValidationError(
          `PREREQUISITE cycle detected: ${cycle.join(" -> ")}`,
          "PREREQUISITE_CYCLE",
        );
      }
      if (c === WHITE) {
        stack.push(next);
        visit(next);
        stack.pop();
      }
    }
    color.set(node, BLACK);
  };

  for (const id of concepts.keys()) {
    if (color.get(id) === WHITE) {
      stack.push(id);
      visit(id);
      stack.pop();
    }
  }
}
