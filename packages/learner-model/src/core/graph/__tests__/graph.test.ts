import { describe, expect, it } from 'vitest';
import { buildGraph } from '../build';
import {
  getAllDependents,
  getAllPrerequisites,
  getContrasts,
  getDependents,
  getParts,
  getPrerequisites,
  getRelated,
  getWhole,
  propagationWeights,
  topologicalOrder,
} from '../graph';
import type { Concept, ConceptEdge } from '../types';

const c = (id: string): Concept => ({
  id,
  name: id,
  cefrLevel: 'B1',
  category: 'GRAMMAR',
});

const edge = (from: string, to: string, kind: ConceptEdge['kind'], weight = 1): ConceptEdge => ({
  from,
  to,
  kind,
  weight,
});

/**
 * Diamond test graph for PREREQUISITE traversal:
 *
 *           a
 *          / \
 *         b   c
 *          \ /
 *           d
 *           |
 *           e
 *
 * Edges point from prerequisite to dependent: a -> b, a -> c, b -> d, c -> d, d -> e.
 *
 * Therefore:
 *   getPrerequisites(d) = [b, c]
 *   getDependents(a)    = [b, c]
 *   getAllPrerequisites(e) covers {d, b, c, a}
 */
function diamond() {
  return buildGraph({
    concepts: ['a', 'b', 'c', 'd', 'e'].map(c),
    edges: [
      edge('a', 'b', 'PREREQUISITE'),
      edge('a', 'c', 'PREREQUISITE'),
      edge('b', 'd', 'PREREQUISITE'),
      edge('c', 'd', 'PREREQUISITE'),
      edge('d', 'e', 'PREREQUISITE'),
    ],
  });
}

describe('traversal - PREREQUISITE', () => {
  it('getPrerequisites returns direct prerequisites', () => {
    const g = diamond();
    expect(getPrerequisites(g, 'd').sort()).toEqual(['b', 'c']);
    expect(getPrerequisites(g, 'a')).toEqual([]);
  });

  it('getDependents returns direct dependents', () => {
    const g = diamond();
    expect(getDependents(g, 'a').sort()).toEqual(['b', 'c']);
    expect(getDependents(g, 'e')).toEqual([]);
  });

  it('getAllPrerequisites returns transitive closure', () => {
    const g = diamond();
    expect(new Set(getAllPrerequisites(g, 'e'))).toEqual(new Set(['d', 'b', 'c', 'a']));
    expect(getAllPrerequisites(g, 'a')).toEqual([]);
  });

  it('getAllDependents returns transitive closure', () => {
    const g = diamond();
    expect(new Set(getAllDependents(g, 'a'))).toEqual(new Set(['b', 'c', 'd', 'e']));
    expect(getAllDependents(g, 'e')).toEqual([]);
  });

  it('returns empty for unknown concept', () => {
    const g = diamond();
    expect(getAllPrerequisites(g, 'ghost')).toEqual([]);
  });
});

describe('traversal - other edge kinds', () => {
  it('getRelated is symmetric (in OR out)', () => {
    const g = buildGraph({
      concepts: [c('a'), c('b'), c('x')],
      edges: [edge('a', 'b', 'RELATED'), edge('x', 'a', 'RELATED')],
    });
    expect(new Set(getRelated(g, 'a'))).toEqual(new Set(['b', 'x']));
  });

  it('getContrasts is symmetric (in OR out)', () => {
    const g = buildGraph({
      concepts: [c('pres_perf'), c('past_simple')],
      edges: [edge('pres_perf', 'past_simple', 'CONTRASTS_WITH')],
    });
    expect(getContrasts(g, 'pres_perf')).toEqual(['past_simple']);
    expect(getContrasts(g, 'past_simple')).toEqual(['pres_perf']);
  });

  it('PART_OF: getParts and getWhole', () => {
    const g = buildGraph({
      concepts: [c('vocab.travel'), c('vocab.travel.airport'), c('vocab.travel.hotel')],
      edges: [
        edge('vocab.travel.airport', 'vocab.travel', 'PART_OF'),
        edge('vocab.travel.hotel', 'vocab.travel', 'PART_OF'),
      ],
    });
    expect(new Set(getParts(g, 'vocab.travel'))).toEqual(
      new Set(['vocab.travel.airport', 'vocab.travel.hotel']),
    );
    expect(getWhole(g, 'vocab.travel.airport')).toEqual(['vocab.travel']);
  });
});

describe('topologicalOrder', () => {
  it('places prerequisites before dependents', () => {
    const g = diamond();
    const order = topologicalOrder(g);
    const idx = (id: string) => order.indexOf(id);
    expect(idx('a')).toBeLessThan(idx('b'));
    expect(idx('a')).toBeLessThan(idx('c'));
    expect(idx('b')).toBeLessThan(idx('d'));
    expect(idx('c')).toBeLessThan(idx('d'));
    expect(idx('d')).toBeLessThan(idx('e'));
  });

  it('returns all concepts', () => {
    const g = diamond();
    expect(topologicalOrder(g).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('propagationWeights', () => {
  it('decays with depth', () => {
    const g = diamond();
    const w = propagationWeights(g, 'e', 0.5);
    // e's direct prereq is d (depth 1), then b/c (depth 2), then a (depth 3)
    expect(w.get('d')).toBeCloseTo(0.5, 5);
    expect(w.get('b')).toBeCloseTo(0.25, 5);
    expect(w.get('c')).toBeCloseTo(0.25, 5);
    expect(w.get('a')).toBeCloseTo(0.125, 5);
  });

  it('keeps the largest weight when multiple paths exist', () => {
    // a is reachable from d via b (depth 2) and via c (depth 2) — same.
    // Add a shortcut a -> d directly to make it depth 1 from d.
    const g = buildGraph({
      concepts: ['a', 'b', 'c', 'd'].map(c),
      edges: [
        edge('a', 'b', 'PREREQUISITE'),
        edge('a', 'c', 'PREREQUISITE'),
        edge('b', 'd', 'PREREQUISITE'),
        edge('c', 'd', 'PREREQUISITE'),
        edge('a', 'd', 'PREREQUISITE'), // shortcut
      ],
    });
    const w = propagationWeights(g, 'd', 0.5);
    // shortest path d -> a is depth 1, weight 0.5
    expect(w.get('a')).toBeCloseTo(0.5, 5);
  });

  it('rejects invalid decay', () => {
    const g = diamond();
    expect(() => propagationWeights(g, 'e', 0)).toThrow();
    expect(() => propagationWeights(g, 'e', 1)).toThrow();
    expect(() => propagationWeights(g, 'e', 1.5)).toThrow();
  });

  it('returns empty for unknown concept', () => {
    const g = diamond();
    expect(propagationWeights(g, 'ghost').size).toBe(0);
  });

  it('returns empty for concept with no prerequisites', () => {
    const g = diamond();
    expect(propagationWeights(g, 'a').size).toBe(0);
  });
});
