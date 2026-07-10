import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { select } from '../select';
import { DEFAULT_POLICY_CONFIG, type DueItem, type SelectionInput } from '../types';

const NOW = 1_700_000_000_000;

function baseInput(over: Partial<SelectionInput> = {}): SelectionInput {
  return {
    userId: 'u1',
    now: NOW,
    masteries: [],
    eventCounts: [],
    prereqEdges: [],
    candidates: [],
    config: DEFAULT_POLICY_CONFIG,
    ...over,
  };
}

const item = (itemId: string, conceptId: string, dueAt: number | null, b = 0.0): DueItem => ({
  itemId,
  conceptId,
  irtDiscrimination: 1.0,
  irtDifficulty: b,
  cefrLevel: 'B1',
  dueAt,
});

describe('select — empties & gate', () => {
  it('returns NO_CANDIDATES on empty pool', () => {
    const out = select(baseInput(), makeRng(1));
    expect(out.ok).toBe(false);
  });

  it('returns NO_CANDIDATES when every candidate is introduction-locked', () => {
    const out = select(
      baseInput({
        candidates: [item('i1', 'present_perfect', null)],
        prereqEdges: [{ from: 'past_simple', to: 'present_perfect', kind: 'PREREQUISITE' }],
        masteries: [
          {
            conceptId: 'past_simple',
            pKnown: 0.2, // unmet prereq
            observationCount: 3,
            lastUpdatedAt: 0,
            pForgetLambda: 0.01,
          },
        ],
      }),
      makeRng(1),
    );
    expect(out.ok).toBe(false);
  });
});

describe('select — review priority', () => {
  it('prefers a due item over a fresh introduction', () => {
    const out = select(
      baseInput({
        candidates: [
          item('fresh', 'vocab.a', null), // unseen
          item('due', 'vocab.b', NOW - 1000), // due in the past
        ],
      }),
      makeRng(42),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.itemId).toBe('due');
      expect(out.result.reason).toBe('REVIEW_DUE');
    }
  });

  it('picks the EARLIEST due item among several', () => {
    const out = select(
      baseInput({
        candidates: [
          item('late', 'c.a', NOW - 100),
          item('early', 'c.b', NOW - 5000),
          item('mid', 'c.c', NOW - 1000),
        ],
      }),
      makeRng(7),
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.itemId).toBe('early');
  });

  it('does NOT treat a future-due item as due', () => {
    const out = select(
      baseInput({
        candidates: [item('future', 'c.a', NOW + 100_000)],
      }),
      makeRng(1),
    );
    // Not REVIEW_DUE; falls through to introduction/floor but still returns it.
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.itemId).toBe('future');
      expect(out.result.reason).not.toBe('REVIEW_DUE');
    }
  });
});

describe('select — determinism', () => {
  it('same seed + same input => identical result', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const input = baseInput({
          candidates: [
            item('i1', 'c.a', null, -0.5),
            item('i2', 'c.b', null, 0.5),
            item('i3', 'c.c', null, 1.0),
          ],
        });
        const a = select(input, makeRng(seed));
        const b = select(input, makeRng(seed));
        expect(a).toEqual(b);
      }),
    );
  });
});

describe('select — gate invariant (property)', () => {
  it('never returns a locked concept', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        // present_perfect is locked (prereq past_simple unmastered & unseen);
        // vocab.free is a free root.
        const input = baseInput({
          candidates: [item('locked', 'present_perfect', null), item('free', 'vocab.free', null)],
          prereqEdges: [
            {
              from: 'past_simple',
              to: 'present_perfect',
              kind: 'PREREQUISITE',
            },
          ],
          masteries: [
            {
              conceptId: 'past_simple',
              pKnown: 0.1,
              observationCount: 2,
              lastUpdatedAt: 0,
              pForgetLambda: 0.01,
            },
          ],
        });
        const out = select(input, makeRng(seed));
        expect(out.ok).toBe(true);
        if (out.ok) {
          expect(out.result.conceptId).not.toBe('present_perfect');
          expect(out.result.itemId).toBe('free');
        }
      }),
    );
  });
});

describe('select — no starvation (property)', () => {
  it('over many seeds, every unlocked concept gets chosen at least once', () => {
    // Three free root concepts, all fresh (no due items) => introduction via
    // Thompson. Across many seeds the sampler must touch all three.
    const candidates = [
      item('i.a', 'c.a', null, 0.0),
      item('i.b', 'c.b', null, 0.0),
      item('i.c', 'c.c', null, 0.0),
    ];
    const chosen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const out = select(baseInput({ candidates }), makeRng(seed));
      if (out.ok) chosen.add(out.result.conceptId);
    }
    expect(chosen).toEqual(new Set(['c.a', 'c.b', 'c.c']));
  });
});

describe('select — item choice within a concept', () => {
  it('prefers earliest-due seen item over unseen within the chosen concept', () => {
    // Single concept so Thompson trivially picks it; two items, one seen.
    const out = select(
      baseInput({
        candidates: [item('unseen', 'c.only', null), item('seen-soon', 'c.only', NOW + 10_000)],
      }),
      makeRng(3),
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.itemId).toBe('seen-soon');
  });
});
