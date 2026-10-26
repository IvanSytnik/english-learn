import { describe, expect, it } from 'vitest';
import { pickStartConcept } from '../../diagnostic/reveal';
import { buildConceptProgress, type ConceptProgressInput } from '../concept-progress';

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;

type Concept = ConceptProgressInput['concepts'][number];
type Mastery = ConceptProgressInput['masteries'][number];
type Review = ConceptProgressInput['reviews'][number];

const concept = (id: string, over: Partial<Concept> = {}): Concept => ({
  id,
  title: `Title ${id}`,
  cefrLevel: 'B1',
  category: 'GRAMMAR',
  itemCount: 4,
  ...over,
});
const mastery = (conceptId: string, over: Partial<Mastery> = {}): Mastery => ({
  conceptId,
  pKnown: 0.5,
  observationCount: 3,
  displayStage: 'DEVELOPING',
  ...over,
});
const review = (conceptId: string, over: Partial<Review> = {}): Review => ({
  conceptId,
  stability: 30,
  cardStatus: 'REVIEW',
  dueAt: NOW + DAY,
  lastReviewAt: NOW - DAY,
  ...over,
});
const build = (over: Partial<ConceptProgressInput>) =>
  buildConceptProgress({
    concepts: [],
    masteries: [],
    reviews: [],
    prereqEdges: [],
    level: null,
    now: NOW,
    ...over,
  });
const views = (board: ReturnType<typeof buildConceptProgress>) =>
  board.sections.flatMap((s) => s.concepts);
const only = (board: ReturnType<typeof buildConceptProgress>) => {
  const [v] = views(board);
  if (!v) throw new Error('no concept');
  return v;
};
const prereq = (from: string, to: string) => ({ from, to, kind: 'PREREQUISITE' as const });

describe('buildConceptProgress — SECURE needs most of the concept remembered', () => {
  const highSolid = (reviewed: number, itemCount = 4) =>
    only(
      build({
        concepts: [concept('g.a', { itemCount })],
        masteries: [mastery('g.a', { pKnown: 0.95, displayStage: 'HIGH_SOLID' })],
        reviews: Array.from({ length: reviewed }, () => review('g.a', { stability: 30 })),
      }),
    ).stage;

  it('one durable item out of four is not SECURE', () => {
    expect(highSolid(1)).toBe('SOLID');
  });

  it('two out of four (median 15 d) is not SECURE', () => {
    expect(highSolid(2)).toBe('SOLID');
  });

  it('three out of four (median 30 d) is SECURE', () => {
    expect(highSolid(3)).toBe('SECURE');
  });

  it('more reviews than items (read race) is safe and clamps the count', () => {
    const v = only(
      build({
        concepts: [concept('g.a', { itemCount: 1 })],
        masteries: [mastery('g.a', { pKnown: 0.95, displayStage: 'HIGH_SOLID' })],
        reviews: [review('g.a'), review('g.a')],
      }),
    );
    expect(v.stage).toBe('SECURE');
    expect(v.practicedItemCount).toBe(1);
    expect(v.itemCount).toBe(1);
  });

  it('a concept without a mastery row is NOT_STARTED', () => {
    expect(only(build({ concepts: [concept('g.a')] })).stage).toBe('NOT_STARTED');
  });
});

describe('buildConceptProgress — fading and last practice', () => {
  it('only a due REVIEW-status item makes the concept fade', () => {
    const board = build({
      concepts: [concept('g.due'), concept('g.relearning'), concept('g.later')],
      masteries: [mastery('g.due'), mastery('g.relearning'), mastery('g.later')],
      reviews: [
        review('g.due', { dueAt: NOW }),
        review('g.relearning', { cardStatus: 'RELEARNING', dueAt: NOW - 60_000 }),
        review('g.relearning', { cardStatus: 'LEARNING', dueAt: NOW - 60_000 }),
        review('g.later', { dueAt: NOW + 1 }),
      ],
    });
    expect(views(board).map((v) => [v.id, v.isFading])).toEqual([
      ['g.due', true],
      ['g.later', false],
      ['g.relearning', false],
    ]);
    expect(board.fadingCount).toBe(1);
  });

  it('last practice counts every reviewed item, relearning included', () => {
    const v = only(
      build({
        concepts: [concept('g.a')],
        masteries: [mastery('g.a')],
        reviews: [
          review('g.a', { lastReviewAt: NOW - 3 * DAY }),
          review('g.a', { cardStatus: 'RELEARNING', lastReviewAt: NOW - 60_000 }),
        ],
      }),
    );
    expect(v.lastPracticedAt).toBe(NOW - 60_000);
    expect(v.practicedItemCount).toBe(2);
  });

  it('never practised → null last practice, 0 of N', () => {
    const v = only(build({ concepts: [concept('g.a')] }));
    expect([v.lastPracticedAt, v.practicedItemCount, v.itemCount]).toEqual([null, 0, 4]);
  });
});

describe('buildConceptProgress — prerequisite lock (selection gate)', () => {
  it('a parent past 0.7 with fewer than 3 outcomes still locks and is named (§8 #19)', () => {
    const board = build({
      concepts: [concept('g.young'), concept('g.child')],
      masteries: [
        mastery('g.young', { pKnown: 0.9, observationCount: 2, displayStage: 'HIGH_SOLID' }),
        mastery('g.child', { pKnown: 0.5, observationCount: 0, displayStage: 'NOT_STARTED' }),
      ],
      prereqEdges: [prereq('g.young', 'g.child')],
    });
    const child = views(board).find((v) => v.id === 'g.child');
    expect(child?.isLocked).toBe(true);
    expect(child?.lockedBy).toEqual([{ id: 'g.young', title: 'Title g.young' }]);
  });

  it('locks behind an unmet prerequisite and names only the unmet ones', () => {
    const board = build({
      concepts: [concept('g.met'), concept('g.unmet'), concept('g.child')],
      masteries: [
        mastery('g.met', { pKnown: 0.7 }),
        mastery('g.unmet', { pKnown: 0.69 }),
        // A bootstrap prior is not practice.
        mastery('g.child', { pKnown: 0.5, observationCount: 0, displayStage: 'NOT_STARTED' }),
      ],
      prereqEdges: [prereq('g.met', 'g.child'), prereq('g.unmet', 'g.child')],
    });
    const child = views(board).find((v) => v.id === 'g.child');
    expect(child?.isLocked).toBe(true);
    expect(child?.lockedBy).toEqual([{ id: 'g.unmet', title: 'Title g.unmet' }]);
    expect(child?.requires.map((r) => r.id)).toEqual(['g.met', 'g.unmet']);
    expect(views(board).find((v) => v.id === 'g.met')?.unlocks).toEqual([
      { id: 'g.child', title: 'Title g.child' },
    ]);
  });

  it('opens once every prerequisite reaches the gate', () => {
    const v = build({
      concepts: [concept('g.parent'), concept('g.child')],
      masteries: [mastery('g.parent', { pKnown: 0.7 })],
      prereqEdges: [prereq('g.parent', 'g.child')],
    });
    expect(views(v).find((c) => c.id === 'g.child')).toMatchObject({
      isLocked: false,
      lockedBy: [],
    });
  });

  it('never locks a started concept', () => {
    const v = build({
      concepts: [concept('g.parent'), concept('g.child')],
      masteries: [
        mastery('g.parent', { pKnown: 0.2 }),
        mastery('g.child', { observationCount: 1 }),
      ],
      prereqEdges: [prereq('g.parent', 'g.child')],
    });
    expect(views(v).find((c) => c.id === 'g.child')?.isLocked).toBe(false);
  });

  it('a prerequisite outside the practisable set still locks, but is never an empty title', () => {
    const v = only(
      build({
        concepts: [concept('g.child')],
        prereqEdges: [prereq('g.ghost', 'g.child')],
      }),
    );
    expect(v.isLocked).toBe(true);
    expect(v.lockedBy).toEqual([]);
    expect(v.requires).toEqual([]);
  });
});

describe('buildConceptProgress — recommended start', () => {
  const input = {
    concepts: [
      concept('g.a2', { cefrLevel: 'A2' }),
      concept('g.b1', { cefrLevel: 'B1' }),
      concept('v.b2', { cefrLevel: 'B2', category: 'VOCAB' }),
    ],
    masteries: [
      mastery('g.a2', { pKnown: 0.6, observationCount: 0, displayStage: 'NOT_STARTED' }),
      mastery('g.b1', { pKnown: 0.375, observationCount: 0, displayStage: 'NOT_STARTED' }),
    ],
    prereqEdges: [prereq('g.a2', 'g.b1')],
  } satisfies Partial<ConceptProgressInput>;
  const recommended = (over: Partial<ConceptProgressInput>) =>
    views(build({ ...input, ...over }))
      .filter((v) => v.isRecommendedStart)
      .map((v) => v.id);

  it('is the diagnostic result’s start concept while nothing is started', () => {
    const expected = pickStartConcept({ ...input, level: 'B2' });
    expect(expected).not.toBeNull();
    expect(recommended({ level: 'B2' })).toEqual([expected]);
  });

  it('is absent without an assessed level', () => {
    expect(recommended({ level: null })).toEqual([]);
  });

  it('is absent once any concept is started', () => {
    expect(
      recommended({
        level: 'B2',
        masteries: [...input.masteries, mastery('v.b2', { observationCount: 1 })],
      }),
    ).toEqual([]);
  });
});

describe('buildConceptProgress — sections and shape', () => {
  it('groups grammar before vocabulary, then by CEFR, then by id; drops empty sections', () => {
    const board = build({
      concepts: [
        concept('v.a', { category: 'VOCAB', cefrLevel: 'A2' }),
        concept('g.z', { cefrLevel: 'A2' }),
        concept('g.b', { cefrLevel: 'B1' }),
        concept('g.a', { cefrLevel: 'B1' }),
      ],
    });
    expect(board.sections.map((s) => [s.category, s.concepts.map((c) => c.id)])).toEqual([
      ['GRAMMAR', ['g.z', 'g.a', 'g.b']],
      ['VOCAB', ['v.a']],
    ]);
  });

  it('exposes only learner-facing fields — no pKnown, no raw reviews', () => {
    const board = build({
      concepts: [concept('g.a')],
      masteries: [mastery('g.a', { pKnown: 0.4321 })],
      reviews: [review('g.a', { stability: 12.345, dueAt: NOW + 777 })],
    });
    expect(Object.keys(board).sort()).toEqual(['fadingCount', 'sections']);
    expect(Object.keys(only(board)).sort()).toEqual(
      [
        'category',
        'cefrLevel',
        'id',
        'isFading',
        'isLocked',
        'isRecommendedStart',
        'itemCount',
        'lastPracticedAt',
        'lockedBy',
        'practicedItemCount',
        'requires',
        'stage',
        'title',
        'unlocks',
      ].sort(),
    );
    const json = JSON.stringify(board);
    for (const leak of ['pKnown', '0.4321', 'stability', '12.345', 'dueAt', String(NOW + 777)]) {
      expect(json).not.toContain(leak);
    }
  });
});
