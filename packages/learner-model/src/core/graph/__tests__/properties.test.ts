import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildGraph, GraphValidationError } from "../build";
import {
  getAllPrerequisites,
  propagationWeights,
  topologicalOrder,
} from "../graph";
import {
  CEFR_LEVELS,
  CONCEPT_CATEGORIES,
  type Concept,
  type ConceptEdge,
} from "../types";

// Arbitraries -----------------------------------------------------------------

const arbConceptId = fc
  .array(
    fc
      .string({ minLength: 1, maxLength: 8 })
      .map((s) => s.toLowerCase().replace(/[^a-z0-9_]/g, ""))
      .filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
    { minLength: 1, maxLength: 3 },
  )
  .map((segments) => segments.join("."))
  .filter((id) => id.length > 0 && id.length <= 96);

const arbConcept: fc.Arbitrary<Concept> = fc.record({
  id: arbConceptId,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  cefrLevel: fc.constantFrom(...CEFR_LEVELS),
  category: fc.constantFrom(...CONCEPT_CATEGORIES),
});

/**
 * Build a random DAG of concepts + PREREQUISITE edges.
 * Strategy: topologically sort generated concepts by their order in the array,
 * then for each concept only add edges from earlier concepts. Guarantees acyclicity.
 */
const arbDag: fc.Arbitrary<{ concepts: Concept[]; edges: ConceptEdge[] }> = fc
  .uniqueArray(arbConcept, {
    minLength: 2,
    maxLength: 12,
    selector: (c) => c.id,
  })
  .chain((concepts) =>
    fc
      .array(
        fc.tuple(
          fc.integer({ min: 0, max: concepts.length - 1 }),
          fc.integer({ min: 0, max: concepts.length - 1 }),
        ),
        { minLength: 0, maxLength: concepts.length * 2 },
      )
      .map((pairs) => {
        const edgeKeys = new Set<string>();
        const edges: ConceptEdge[] = [];
        for (const [i, j] of pairs) {
          if (i >= j) continue; // enforce topo order -> DAG
          const from = concepts[i]!.id;
          const to = concepts[j]!.id;
          const k = `${from}>PREREQUISITE>${to}`;
          if (edgeKeys.has(k)) continue;
          edgeKeys.add(k);
          edges.push({ from, to, kind: "PREREQUISITE", weight: 1 });
        }
        return { concepts, edges };
      }),
  );

// Properties ------------------------------------------------------------------

describe("property: buildGraph", () => {
  it("any DAG is accepted", () => {
    fc.assert(
      fc.property(arbDag, ({ concepts, edges }) => {
        const g = buildGraph({ concepts, edges });
        expect(g.concepts.size).toBe(concepts.length);
        expect(g.edges).toHaveLength(edges.length);
      }),
      { numRuns: 200 },
    );
  });

  it("introducing a back-edge creates a cycle and is rejected", () => {
    fc.assert(
      fc.property(arbDag, ({ concepts, edges }) => {
        if (edges.length === 0) return; // skip empty
        // Pick any existing edge and add its reverse — must form a cycle.
        const e = edges[0]!;
        const reverse: ConceptEdge = {
          from: e.to,
          to: e.from,
          kind: "PREREQUISITE",
          weight: 1,
        };
        expect(() =>
          buildGraph({ concepts, edges: [...edges, reverse] }),
        ).toThrow(GraphValidationError);
      }),
      { numRuns: 100 },
    );
  });
});

describe("property: topologicalOrder", () => {
  it("respects PREREQUISITE order for all edges", () => {
    fc.assert(
      fc.property(arbDag, ({ concepts, edges }) => {
        const g = buildGraph({ concepts, edges });
        const order = topologicalOrder(g);
        const pos = new Map(order.map((id, i) => [id, i]));
        for (const e of edges) {
          expect(pos.get(e.from)!).toBeLessThan(pos.get(e.to)!);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("returns every concept exactly once", () => {
    fc.assert(
      fc.property(arbDag, ({ concepts, edges }) => {
        const g = buildGraph({ concepts, edges });
        const order = topologicalOrder(g);
        expect(order).toHaveLength(concepts.length);
        expect(new Set(order).size).toBe(concepts.length);
      }),
      { numRuns: 200 },
    );
  });
});

describe("property: getAllPrerequisites is closed", () => {
  it("contains all transitive prerequisites", () => {
    fc.assert(
      fc.property(arbDag, ({ concepts, edges }) => {
        const g = buildGraph({ concepts, edges });
        for (const concept of concepts) {
          const closure = new Set(getAllPrerequisites(g, concept.id));
          // For every concept in closure, its direct prerequisites must also be in closure.
          for (const c of closure) {
            const direct = (g.incoming.get(c) ?? [])
              .filter((e) => e.kind === "PREREQUISITE")
              .map((e) => e.from);
            for (const d of direct) {
              expect(closure.has(d)).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("property: propagationWeights", () => {
  it("weights are monotonically non-increasing with depth", () => {
    fc.assert(
      fc.property(
        arbDag,
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        ({ concepts, edges }, decay) => {
          const g = buildGraph({ concepts, edges });
          for (const concept of concepts) {
            const weights = propagationWeights(g, concept.id, decay);
            for (const [, w] of weights) {
              expect(w).toBeGreaterThan(0);
              expect(w).toBeLessThanOrEqual(decay); // depth >= 1 means w <= decay^1
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
