import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { levelPriorMean } from '../level-score';
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

const item = (
  itemId: string,
  conceptId: string,
  dueAt: number | null,
  b = 0.0,
  lastReviewAt: number | null = null,
): DueItem => ({
  itemId,
  conceptId,
  irtDiscrimination: 1.0,
  irtDifficulty: b,
  cefrLevel: 'B1',
  dueAt,
  lastReviewAt,
});

const mastery = (conceptId: string, pKnown: number, observationCount: number) => ({
  conceptId,
  pKnown,
  observationCount,
  lastUpdatedAt: 0,
  pForgetLambda: 0.01,
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

describe('select — explanation fields (E2)', () => {
  const edges = [{ from: 'past_simple', to: 'present_perfect', kind: 'PREREQUISITE' as const }];

  it('REVIEW_DUE: started concept, no unlockedBy, lastPracticedAt = latest review in concept', () => {
    const out = select(
      baseInput({
        masteries: [mastery('c.a', 0.5, 3)],
        candidates: [
          item('due', 'c.a', NOW - 1000, 0, NOW - 5 * 86_400_000),
          item('sibling', 'c.a', NOW + 1000, 0, NOW - 2 * 86_400_000),
        ],
      }),
      makeRng(1),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.reason).toBe('REVIEW_DUE');
    expect(out.result.isNewConcept).toBe(false);
    expect(out.result.unlockedBy).toEqual([]);
    expect(out.result.lastPracticedAt).toBe(NOW - 2 * 86_400_000);
  });

  it('NEW_INTRODUCTION of a gated concept reports the parent that unlocked it', () => {
    const out = select(
      baseInput({
        prereqEdges: edges,
        // past_simple mastered, but has no candidate item → only present_perfect is selectable.
        masteries: [mastery('past_simple', 0.8, 6)],
        candidates: [item('pp', 'present_perfect', null)],
      }),
      makeRng(1),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.reason).toBe('NEW_INTRODUCTION');
    expect(out.result.isNewConcept).toBe(true);
    expect(out.result.unlockedBy).toEqual(['past_simple']);
    expect(out.result.lastPracticedAt).toBeNull();
  });

  it('a root concept on a bootstrap prior is new with empty unlockedBy', () => {
    const out = select(
      baseInput({
        masteries: [mastery('past_simple', 0.6, 0)],
        candidates: [item('ps', 'past_simple', null)],
      }),
      makeRng(1),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.isNewConcept).toBe(true);
    expect(out.result.unlockedBy).toEqual([]);
  });

  it('NEW_INTRODUCTION of an already-started concept is not new (gotcha 37c)', () => {
    const out = select(
      baseInput({
        prereqEdges: edges,
        masteries: [mastery('past_simple', 0.8, 6), mastery('present_perfect', 0.4, 2)],
        candidates: [item('pp', 'present_perfect', NOW + 60_000, 0, NOW - 60_000)],
      }),
      makeRng(1),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.reason).toBe('NEW_INTRODUCTION');
    expect(out.result.isNewConcept).toBe(false);
    expect(out.result.unlockedBy).toEqual([]);
    expect(out.result.lastPracticedAt).toBe(NOW - 60_000);
  });
});

describe('select — start concept (§9 п. 6)', () => {
  // Three free roots, nothing due: without a start concept Thompson decides.
  const roots = [
    item('i.a', 'c.a', null, -0.5),
    item('i.b', 'c.b', null, 0.0),
    item('i.b2', 'c.b', null, 0.5),
    item('i.c', 'c.c', null, 1.0),
  ];

  it('introduces the start concept for every seed, before any Beta draw', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = makeRng(seed);
        const out = select(baseInput({ candidates: roots, startConceptId: 'c.b' }), rng);
        expect(out.ok && out.result).toMatchObject({
          conceptId: 'c.b',
          itemId: 'i.b',
          reason: 'NEW_INTRODUCTION',
          isNewConcept: true,
          debugScores: {},
        });
        // The rng was not touched: its next value is a fresh generator's first.
        expect(rng.next()).toBe(makeRng(seed).next());
      }),
    );
  });

  it('a due review still comes first', () => {
    const out = select(
      baseInput({
        candidates: [...roots, item('due', 'c.a', NOW - 1000)],
        masteries: [mastery('c.a', 0.3, 1)],
        startConceptId: 'c.b',
      }),
      makeRng(1),
    );
    expect(out.ok && out.result).toMatchObject({ itemId: 'due', reason: 'REVIEW_DUE' });
  });

  it('is ignored when started, locked or without a candidate — the result is as without it', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const gated = {
          prereqEdges: [{ from: 'c.a', to: 'c.d', kind: 'PREREQUISITE' as const }],
          candidates: [...roots, item('i.d', 'c.d', null)],
        };
        const cases: [Partial<SelectionInput>, string][] = [
          [{ candidates: roots, masteries: [mastery('c.b', 0.3, 2)] }, 'c.b'],
          [gated, 'c.d'],
          [{ candidates: roots }, 'c.unknown'],
        ];
        for (const [over, startConceptId] of cases) {
          const without = select(baseInput(over), makeRng(seed));
          const withStart = select(baseInput({ ...over, startConceptId }), makeRng(seed));
          expect(withStart).toEqual(without);
        }
      }),
    );
  });

  it('never returns empty or a locked concept, whatever start concept is passed (property)', () => {
    const concepts = ['c.a', 'c.b', 'c.c', 'c.d', 'c.none'];
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(...concepts), fc.boolean(), (seed, start, seen) => {
        const out = select(
          baseInput({
            candidates: [...roots, item('i.d', 'c.d', null)],
            prereqEdges: [{ from: 'c.a', to: 'c.d', kind: 'PREREQUISITE' }],
            masteries: seen ? [mastery('c.a', 0.2, 1)] : [],
            startConceptId: start,
          }),
          makeRng(seed),
        );
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.result.conceptId).not.toBe('c.d');
      }),
    );
  });
});

describe('select — V6b with the learner level (§8 #19)', () => {
  // CEFR ranks: A2 1, B1 2, B2 3, C1 4.
  const B1 = 2;
  const levels = { 'c.a2': 'A2', 'c.b1': 'B1', 'c.b1x': 'B1', 'c.b2': 'B2' } as const;
  const candidates = [
    item('i.a2', 'c.a2', null),
    item('i.b1', 'c.b1', null),
    item('i.b1x', 'c.b1x', null),
    item('i.b2', 'c.b2', null),
  ];
  const leveled = (over: Partial<SelectionInput> = {}) =>
    baseInput({ candidates, learnerLevel: { theta: B1 }, conceptLevels: levels, ...over });
  const tally = (input: SelectionInput, seeds = 400) => {
    const n: Record<string, number> = {};
    for (let seed = 0; seed < seeds; seed++) {
      const out = select(input, makeRng(seed));
      if (out.ok) n[out.result.conceptId] = (n[out.result.conceptId] ?? 0) + 1;
    }
    return n;
  };

  it('without a level it is today’s policy, byte for byte (absent, null, or levels alone)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.boolean(), (seed, mastered) => {
        const input = baseInput({
          candidates,
          masteries: mastered ? [mastery('c.b1', 0.9, 5)] : [],
          eventCounts: [{ conceptId: 'c.a2', correct: 2, incorrect: 1 }],
        });
        const today = select(input, makeRng(seed));
        expect(select({ ...input, learnerLevel: null }, makeRng(seed))).toEqual(today);
        expect(select({ ...input, conceptLevels: levels }, makeRng(seed))).toEqual(today);
      }),
    );
  });

  it('same seed + same input => identical result', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        expect(select(leveled(), makeRng(seed))).toEqual(select(leveled(), makeRng(seed)));
      }),
    );
  });

  it('prefers the target level: both B1 concepts get chosen, B1 wins most draws', () => {
    const n = tally(leveled());
    expect(n['c.b1']).toBeGreaterThan(0);
    expect(n['c.b1x']).toBeGreaterThan(0);
    expect((n['c.b1'] ?? 0) + (n['c.b1x'] ?? 0)).toBeGreaterThan(0.9 * 400);
  });

  it('C1 aims at the top content level', () => {
    const n = tally(leveled({ learnerLevel: { theta: 4 } }));
    expect(n['c.b2'] ?? 0).toBeGreaterThan(0.9 * 400);
  });

  it('a mastered concept sits the draw out — one fewer Beta draw — and the others are drawn', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const out = select(leveled({ masteries: [mastery('c.b1', 0.9, 3)] }), makeRng(seed));
        expect(out.ok && out.result.conceptId).not.toBe('c.b1');
        expect(out.ok && Object.keys(out.result.debugScores).sort()).toEqual([
          'c.a2',
          'c.b1x',
          'c.b2',
        ]);
      }),
    );
  });

  it('mastery needs the observations too: pKnown 0.9 on 2 outcomes stays in the draw', () => {
    const out = select(leveled({ masteries: [mastery('c.b1', 0.9, 2)] }), makeRng(1));
    expect(out.ok && Object.keys(out.result.debugScores)).toContain('c.b1');
  });

  it('everything mastered: the draw runs over all of them (never empty)', () => {
    const all = Object.keys(levels).map((id) => mastery(id, 0.95, 5));
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const out = select(leveled({ masteries: all }), makeRng(seed));
        expect(out.ok).toBe(true);
        expect(out.ok && Object.keys(out.result.debugScores)).toHaveLength(4);
      }),
    );
  });

  it('no starvation: always a result, never a locked concept, whatever the level and history', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 1, max: 5 }),
        fc.subarray(Object.keys(levels)),
        (seed, theta, masteredIds) => {
          const out = select(
            leveled({
              learnerLevel: { theta },
              masteries: masteredIds.map((id) => mastery(id, 0.95, 5)),
              candidates: [...candidates, item('locked', 'c.locked', null)],
              prereqEdges: [{ from: 'c.never', to: 'c.locked', kind: 'PREREQUISITE' }],
            }),
            makeRng(seed),
          );
          expect(out.ok).toBe(true);
          expect(out.ok && out.result.conceptId).not.toBe('c.locked');
        },
      ),
    );
  });

  it('a concept missing from conceptLevels falls back to its item’s level', () => {
    // item() puts every item at B1: without conceptLevels all four tie on level.
    const n = tally(leveled({ conceptLevels: {} }));
    expect(Object.keys(n).sort()).toEqual(['c.a2', 'c.b1', 'c.b1x', 'c.b2']);
  });

  it('REVIEW_DUE and the start concept still come first', () => {
    const due = select(
      leveled({ candidates: [...candidates, item('due', 'c.b2', NOW - 1)] }),
      makeRng(1),
    );
    expect(due.ok && due.result.reason).toBe('REVIEW_DUE');
    const start = select(leveled({ startConceptId: 'c.a2' }), makeRng(1));
    expect(start.ok && start.result.conceptId).toBe('c.a2');
  });
});

describe('levelPriorMean', () => {
  const cfg = DEFAULT_POLICY_CONFIG.levelPolicy;
  it('at the own level 0.25 + 0.65·σ(0.75) ≈ 0.689; tends to pGuess below and 1 − pSlip above', () => {
    expect(levelPriorMean(2, 2, cfg)).toBeCloseTo(0.25 + 0.65 / (1 + Math.exp(-0.75)), 12);
    expect(levelPriorMean(5, 0, cfg)).toBeCloseTo(0.9, 2);
    expect(levelPriorMean(0, 5, cfg)).toBeCloseTo(0.25, 2);
  });
});
