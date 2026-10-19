import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CEFR_LEVELS, CEFR_RANK } from '../../core/graph/types';
import type { ConceptMasterySnapshot, PrereqEdge } from '../../policy/types';
import {
  buildPlacementReveal,
  type PlacementRevealInput,
  pickStartConcept,
  placementBand,
  type RevealAnswerFact,
} from '../reveal';

const tag = (slug: string) => ({ id: `tag.${slug}`, slug, title: slug, category: 'GRAMMAR' });
const ans = (
  axis: RevealAnswerFact['axis'],
  correct: boolean,
  skillTag: RevealAnswerFact['skillTag'] = null,
  dontKnow = false,
): RevealAnswerFact => ({ axis, correct, dontKnow, skillTag });
const prior = (conceptId: string, pKnown: number): ConceptMasterySnapshot => ({
  conceptId,
  pKnown,
  observationCount: 0,
  lastUpdatedAt: 0,
  pForgetLambda: 0.01,
});
const prereq = (from: string, to: string): PrereqEdge => ({ from, to, kind: 'PREREQUISITE' });

function input(over: Partial<PlacementRevealInput> = {}): PlacementRevealInput {
  return {
    assessedLevel: 'A2',
    levelTrajectory: ['B1', 'A2', 'A2'],
    answers: [],
    concepts: [],
    masteries: [],
    prereqEdges: [],
    ...over,
  };
}

describe('placementBand', () => {
  it('spans the last steps of the trajectory, ignoring the early search', () => {
    // Starts at B1, drops, then oscillates A1/A2.
    expect(placementBand('A2', ['B1', 'B1', 'A2', 'A1', 'A2', 'A1'])).toEqual({
      low: 'A1',
      high: 'A2',
    });
  });

  it('collapses to the assessed level when the CAT settled', () => {
    expect(placementBand('B1', ['B1', 'B1', 'B1', 'B1', 'B1'])).toEqual({ low: 'B1', high: 'B1' });
    expect(placementBand('B2', [])).toEqual({ low: 'B2', high: 'B2' });
  });

  it('always contains the assessed level (property)', () => {
    const level = fc.constantFrom(...CEFR_LEVELS);
    fc.assert(
      fc.property(level, fc.array(level, { maxLength: 15 }), (assessed, traj) => {
        const { low, high } = placementBand(assessed, traj);
        expect(CEFR_RANK[low]).toBeLessThanOrEqual(CEFR_RANK[assessed]);
        expect(CEFR_RANK[high]).toBeGreaterThanOrEqual(CEFR_RANK[assessed]);
      }),
    );
  });
});

describe('buildPlacementReveal — axes and skill tags', () => {
  const answers = [
    ans('GRAMMAR', true, tag('past-simple')),
    ans('GRAMMAR', true, tag('past-simple')),
    ans('GRAMMAR', false, tag('articles')),
    ans('GRAMMAR', false, tag('articles'), true), // "I don't know"
    ans('VOCAB', true),
    ans('VOCAB', false, null, true),
    ans('VOCAB', true),
  ];

  it('summarises only axes that were answered, with dontKnow counted as not correct', () => {
    const r = buildPlacementReveal(input({ answers }));
    expect(r.axes.map((a) => a.axis)).toEqual(['VOCAB', 'GRAMMAR']);
    const grammar = r.axes.find((a) => a.axis === 'GRAMMAR');
    expect(grammar).toMatchObject({ answered: 4, correct: 2, dontKnow: 1, reliable: true });
    expect(grammar?.accuracy).toBeCloseTo(0.5, 10);
  });

  it('breaks down by skill tag, strongest first, flagging sparse tags as unreliable', () => {
    const r = buildPlacementReveal(input({ answers }));
    expect(r.skillTags.map((t) => t.tag.slug)).toEqual(['past-simple', 'articles']);
    expect(r.skillTags[0]).toMatchObject({ answered: 2, correct: 2, accuracy: 1, reliable: false });
    expect(r.skillTags[1]).toMatchObject({ answered: 2, correct: 0, dontKnow: 1 });
    expect(r.untaggedAnswers).toBe(3);
  });

  it('a mis-flagged correct+dontKnow answer is not counted correct', () => {
    const r = buildPlacementReveal(input({ answers: [ans('GRAMMAR', true, null, true)] }));
    expect(r.axes[0]).toMatchObject({ answered: 1, correct: 0, dontKnow: 1 });
  });
});

describe('pickStartConcept', () => {
  const concepts = [
    { id: 'grammar.present_simple', cefrLevel: 'A2' as const },
    { id: 'grammar.past_simple', cefrLevel: 'A2' as const },
    { id: 'grammar.past_participle', cefrLevel: 'A2' as const },
    { id: 'grammar.conditional_0_1', cefrLevel: 'B1' as const },
  ];
  const edges = [prereq('grammar.past_simple', 'grammar.past_participle')];

  it('picks an unlocked concept at the assessed level, weakest prior first', () => {
    const start = pickStartConcept(
      input({
        concepts,
        prereqEdges: edges,
        masteries: [
          prior('grammar.present_simple', 0.6),
          prior('grammar.past_simple', 0.45),
          prior('grammar.past_participle', 0.15),
        ],
      }),
    );
    // past_participle is weaker but gated behind past_simple (0.45 < 0.7).
    expect(start).toBe('grammar.past_simple');
  });

  it('prefers the assessed level over a farther level', () => {
    const start = pickStartConcept(
      input({ assessedLevel: 'B1', concepts, masteries: [prior('grammar.conditional_0_1', 0.6)] }),
    );
    expect(start).toBe('grammar.conditional_0_1');
  });

  it('skips concepts that already have practice and returns null when nothing is eligible', () => {
    const practised = { ...prior('grammar.present_simple', 0.5), observationCount: 3 };
    expect(
      pickStartConcept(
        input({
          concepts: [{ id: 'grammar.present_simple', cefrLevel: 'A2' }],
          masteries: [practised],
        }),
      ),
    ).toBeNull();
  });

  it('is exposed on the reveal', () => {
    const r = buildPlacementReveal(input({ concepts, prereqEdges: edges }));
    expect(r.startConcept).not.toBeNull();
    expect(r.startConcept).not.toBe('grammar.past_participle');
  });
});
