import type { CefrLevelValue } from '@englishlearn/db/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ConceptMasterySnapshot, PrereqEdge } from '../../policy/types';
import {
  LADDER_AXES,
  LADDER_LEVELS,
  type LadderAnswer,
  type LadderPoolItem,
  nextLadderStep,
  TOTAL_QUESTIONS,
} from '../ladder';
import {
  buildPlacementReveal,
  type PlacementRevealInput,
  pickStartConcept,
  type RevealAnswerFact,
  type StartConceptInput,
} from '../reveal';

const tag = (slug: string) => ({ id: `tag.${slug}`, slug, title: slug, category: 'GRAMMAR' });
const prior = (conceptId: string, pKnown: number): ConceptMasterySnapshot => ({
  conceptId,
  pKnown,
  observationCount: 0,
  lastUpdatedAt: 0,
  pForgetLambda: 0.01,
});
const prereq = (from: string, to: string): PrereqEdge => ({ from, to, kind: 'PREREQUISITE' });

type Verdict = 'right' | 'wrong' | 'dontKnow';

/** Answers in attempt order: even positions GRAMMAR, odd VOCAB, like the ladder. */
function attempt(
  grammar: readonly (readonly [CefrLevelValue, Verdict])[],
  vocab: readonly (readonly [CefrLevelValue, Verdict])[] = [],
): RevealAnswerFact[] {
  const out: RevealAnswerFact[] = [];
  const fact = (
    axis: RevealAnswerFact['axis'],
    position: number,
    [itemLevel, v]: readonly [CefrLevelValue, Verdict],
  ): RevealAnswerFact => ({
    axis,
    position,
    itemLevel,
    correct: v === 'right',
    dontKnow: v === 'dontKnow',
    skillTag: null,
  });
  grammar.forEach((g, i) => {
    out.push(fact('GRAMMAR', 2 * i, g));
  });
  vocab.forEach((v, i) => {
    out.push(fact('VOCAB', 2 * i + 1, v));
  });
  return out.sort((a, b) => a.position - b.position);
}

function input(over: Partial<PlacementRevealInput> = {}): PlacementRevealInput {
  return { answers: [], concepts: [], masteries: [], prereqEdges: [], ...over };
}

describe('buildPlacementReveal — levels', () => {
  it('gives each axis its own ladder level and the attempt the floored mean', () => {
    const r = buildPlacementReveal(
      input({
        answers: attempt(
          [
            ['B2', 'right'],
            ['B2', 'wrong'],
            ['B2', 'right'],
            ['B2', 'wrong'],
          ],
          [
            ['A2', 'wrong'],
            ['A2', 'right'],
            ['A2', 'wrong'],
            ['A2', 'right'],
          ],
        ),
      }),
    );
    expect(r.axes).toEqual([
      { axis: 'VOCAB', level: 'A2', reliable: true },
      { axis: 'GRAMMAR', level: 'B2', reliable: true },
    ]);
    // mean(B2 = 3, A2 = 1) = 2 → B1
    expect(r.level).toBe('B1');
  });

  it('rounds the attempt level down between two adjacent axis levels', () => {
    const r = buildPlacementReveal(
      input({
        answers: attempt(
          [
            ['C1', 'right'],
            ['C1', 'right'],
          ],
          [
            ['B2', 'right'],
            ['B2', 'right'],
          ],
        ),
      }),
    );
    expect(r.level).toBe('B2');
  });

  it('takes the level from the questions answered, not from the share answered correctly', () => {
    // All right on A2 questions stays A2; all wrong on C1 questions stays C1.
    const r = buildPlacementReveal(
      input({
        answers: attempt(
          Array.from({ length: 4 }, () => ['A2', 'right'] as const),
          Array.from({ length: 4 }, () => ['C1', 'wrong'] as const),
        ),
      }),
    );
    expect(r.axes.map((a) => [a.axis, a.level])).toEqual([
      ['VOCAB', 'C1'],
      ['GRAMMAR', 'A2'],
    ]);
  });

  it('only the last answers of an axis count (the early climb is ignored)', () => {
    const r = buildPlacementReveal(
      input({
        answers: attempt([
          ['B1', 'right'],
          ['B1', 'right'],
          ['B2', 'right'],
          ['B2', 'right'],
          ['C1', 'right'],
          ['C1', 'right'],
          ['C1', 'right'],
          ['C1', 'right'],
        ]),
      }),
    );
    expect(r.axes).toEqual([{ axis: 'GRAMMAR', level: 'C1', reliable: true }]);
  });

  it('leaves out an axis with no answers and flags a sparse one', () => {
    const r = buildPlacementReveal(
      input({
        answers: attempt([
          ['B2', 'right'],
          ['B2', 'dontKnow'],
        ]),
      }),
    );
    expect(r.axes).toEqual([{ axis: 'GRAMMAR', level: 'B2', reliable: false }]);
    expect(r.level).toBe('B2');
  });

  it('has no level and no start concept when nothing was answered', () => {
    const r = buildPlacementReveal(
      input({ concepts: [{ id: 'grammar.present_simple', cefrLevel: 'A2' }] }),
    );
    expect(r.level).toBeNull();
    expect(r.axes).toEqual([]);
    expect(r.startConcept).toBeNull();
  });

  it('does not depend on the order the answers arrive in', () => {
    // In position order the last four are A2 C1 C1 C1 (→ B2); read backwards
    // they would be C1 A2 A2 A2 (→ A2).
    const answers = attempt([
      ['A2', 'right'],
      ['A2', 'right'],
      ['A2', 'right'],
      ['C1', 'right'],
      ['C1', 'right'],
      ['C1', 'right'],
    ]);
    const shuffled = buildPlacementReveal(input({ answers: [...answers].reverse() }));
    expect(shuffled.axes).toEqual([{ axis: 'GRAMMAR', level: 'B2', reliable: true }]);
    expect(shuffled).toEqual(buildPlacementReveal(input({ answers })));
  });

  it('axes carry the level only — no counts or fractions for the screen', () => {
    const r = buildPlacementReveal(
      input({ answers: attempt([['B1', 'right']], [['B1', 'wrong']]) }),
    );
    for (const a of r.axes) expect(Object.keys(a).sort()).toEqual(['axis', 'level', 'reliable']);
  });
});

describe('buildPlacementReveal — agrees with the ladder engine', () => {
  const BANK: LadderPoolItem[] = LADDER_AXES.flatMap((axis) =>
    LADDER_LEVELS.flatMap((level) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: `${axis}-${level}-${i}`,
        axis,
        cefrLevel: level,
      })),
    ),
  );

  it('the reveal of a finished attempt says what nextLadderStep completed with (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Verdict>('right', 'wrong', 'dontKnow'), {
          minLength: TOTAL_QUESTIONS,
          maxLength: TOTAL_QUESTIONS,
        }),
        (vs) => {
          const answers: LadderAnswer[] = [];
          for (;;) {
            const step = nextLadderStep({ attemptId: 'att-1', answers, pool: BANK });
            if (step.kind === 'complete') {
              const r = buildPlacementReveal(
                input({ answers: answers.map((a) => ({ ...a, skillTag: null })) }),
              );
              expect(r.level).toBe(step.assessedLevel);
              expect(Object.fromEntries(r.axes.map((a) => [a.axis, a.level]))).toEqual(
                Object.fromEntries(step.axes.map((a) => [a.axis, a.level])),
              );
              return;
            }
            if (step.kind !== 'question') throw new Error(`unexpected ${step.kind}`);
            const v = vs[step.position] as Verdict;
            answers.push({
              position: step.position,
              axis: step.axis,
              itemId: step.itemId,
              itemLevel: BANK.find((p) => p.id === step.itemId)?.cefrLevel as CefrLevelValue,
              correct: v === 'right',
              dontKnow: v === 'dontKnow',
            });
          }
        },
      ),
    );
  });
});

describe('buildPlacementReveal — skill tags', () => {
  const tagged = (
    position: number,
    correct: boolean,
    skillTag: RevealAnswerFact['skillTag'],
    dontKnow = false,
  ): RevealAnswerFact => ({
    axis: position % 2 === 0 ? 'GRAMMAR' : 'VOCAB',
    position,
    itemLevel: 'B1',
    correct,
    dontKnow,
    skillTag,
  });
  const answers = [
    tagged(0, true, tag('past-simple')),
    tagged(2, true, tag('past-simple')),
    tagged(4, false, tag('articles')),
    tagged(6, false, tag('articles'), true), // "I don't know"
    tagged(1, true, null),
    tagged(3, false, null, true),
    tagged(5, true, null),
  ];

  it('breaks down by skill tag, strongest first, flagging sparse tags as unreliable', () => {
    const r = buildPlacementReveal(input({ answers }));
    expect(r.skillTags.map((t) => t.tag.slug)).toEqual(['past-simple', 'articles']);
    expect(r.skillTags[0]).toMatchObject({ answered: 2, correct: 2, accuracy: 1, reliable: false });
    expect(r.skillTags[1]).toMatchObject({ answered: 2, correct: 0, dontKnow: 1 });
    expect(r.untaggedAnswers).toBe(3);
  });

  it('a mis-flagged correct+dontKnow answer is not counted correct', () => {
    const r = buildPlacementReveal(input({ answers: [tagged(0, true, tag('x'), true)] }));
    expect(r.skillTags[0]).toMatchObject({ answered: 1, correct: 0, dontKnow: 1 });
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
  const start = (over: Partial<StartConceptInput>): StartConceptInput => ({
    level: 'A2',
    concepts,
    masteries: [],
    prereqEdges: [],
    ...over,
  });

  it('picks an unlocked concept at the level, weakest prior first', () => {
    const picked = pickStartConcept(
      start({
        prereqEdges: edges,
        masteries: [
          prior('grammar.present_simple', 0.6),
          prior('grammar.past_simple', 0.45),
          prior('grammar.past_participle', 0.15),
        ],
      }),
    );
    // past_participle is weaker but gated behind past_simple (0.45 < 0.7).
    expect(picked).toBe('grammar.past_simple');
  });

  it('prefers the level over a farther level', () => {
    expect(
      pickStartConcept(start({ level: 'B1', masteries: [prior('grammar.conditional_0_1', 0.6)] })),
    ).toBe('grammar.conditional_0_1');
  });

  it('skips concepts that already have practice and returns null when nothing is eligible', () => {
    const practised = { ...prior('grammar.present_simple', 0.5), observationCount: 3 };
    expect(
      pickStartConcept(
        start({
          concepts: [{ id: 'grammar.present_simple', cefrLevel: 'A2' }],
          masteries: [practised],
        }),
      ),
    ).toBeNull();
  });

  it('is exposed on the reveal, near the assessed level', () => {
    const r = buildPlacementReveal(
      input({
        answers: attempt([
          ['B1', 'right'],
          ['B1', 'right'],
        ]),
        concepts,
        prereqEdges: edges,
      }),
    );
    expect(r.level).toBe('B1');
    expect(r.startConcept).toBe('grammar.conditional_0_1');
  });
});
