import { describe, expect, it } from "vitest";
import { buildGraph, GraphValidationError } from "../build";
import type { Concept, ConceptEdge } from "../types";

const c = (id: string, level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" = "A2"): Concept => ({
  id,
  name: id,
  cefrLevel: level,
  category: "GRAMMAR",
});

describe("buildGraph - validation", () => {
  it("builds an empty graph", () => {
    const g = buildGraph({ concepts: [], edges: [] });
    expect(g.concepts.size).toBe(0);
    expect(g.edges).toHaveLength(0);
  });

  it("builds a graph with concepts and edges", () => {
    const g = buildGraph({
      concepts: [c("past_participle"), c("present_perfect")],
      edges: [
        {
          from: "past_participle",
          to: "present_perfect",
          kind: "PREREQUISITE",
          weight: 1,
        },
      ],
    });
    expect(g.concepts.size).toBe(2);
    expect(g.edges).toHaveLength(1);
    expect(g.outgoing.get("past_participle")).toHaveLength(1);
    expect(g.incoming.get("present_perfect")).toHaveLength(1);
  });

  it("rejects invalid concept IDs", () => {
    expect(() =>
      buildGraph({
        concepts: [{ ...c("Present_Perfect"), id: "Present_Perfect" }],
        edges: [],
      }),
    ).toThrow();
  });

  it("rejects duplicate concept IDs", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a"), c("a")],
        edges: [],
      }),
    ).toThrow(GraphValidationError);
  });

  it("rejects edges referencing unknown concepts", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a")],
        edges: [
          { from: "a", to: "ghost", kind: "PREREQUISITE", weight: 1 },
        ],
      }),
    ).toThrow(/UNKNOWN_CONCEPT_REF|unknown/i);
  });

  it("rejects self-loops", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a")],
        edges: [{ from: "a", to: "a", kind: "RELATED", weight: 1 }],
      }),
    ).toThrow();
  });

  it("rejects duplicate (from, to, kind) edges", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a"), c("b")],
        edges: [
          { from: "a", to: "b", kind: "RELATED", weight: 1 },
          { from: "a", to: "b", kind: "RELATED", weight: 1 },
        ],
      }),
    ).toThrow(GraphValidationError);
  });

  it("allows the same (from, to) with different kinds", () => {
    const g = buildGraph({
      concepts: [c("a"), c("b")],
      edges: [
        { from: "a", to: "b", kind: "RELATED", weight: 1 },
        { from: "a", to: "b", kind: "CONTRASTS_WITH", weight: 1 },
      ],
    });
    expect(g.edges).toHaveLength(2);
  });

  it("rejects PREREQUISITE cycles", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a"), c("b"), c("c")],
        edges: [
          { from: "a", to: "b", kind: "PREREQUISITE", weight: 1 },
          { from: "b", to: "c", kind: "PREREQUISITE", weight: 1 },
          { from: "c", to: "a", kind: "PREREQUISITE", weight: 1 },
        ],
      }),
    ).toThrow(/PREREQUISITE_CYCLE|cycle/i);
  });

  it("allows cycles in non-PREREQUISITE kinds (e.g. RELATED)", () => {
    const g = buildGraph({
      concepts: [c("a"), c("b")],
      edges: [
        { from: "a", to: "b", kind: "RELATED", weight: 1 },
        { from: "b", to: "a", kind: "RELATED", weight: 1 },
      ],
    });
    expect(g.edges).toHaveLength(2);
  });

  it("validates concept ID with dotted namespaces", () => {
    const g = buildGraph({
      concepts: [c("vocab.travel.airport"), c("vocab.travel")],
      edges: [
        {
          from: "vocab.travel.airport",
          to: "vocab.travel",
          kind: "PART_OF",
          weight: 1,
        },
      ],
    });
    expect(g.concepts.has("vocab.travel.airport")).toBe(true);
  });

  it("rejects concept IDs with > 6 segments", () => {
    expect(() =>
      buildGraph({
        concepts: [c("a.b.c.d.e.f.g")],
        edges: [],
      }),
    ).toThrow();
  });
});
