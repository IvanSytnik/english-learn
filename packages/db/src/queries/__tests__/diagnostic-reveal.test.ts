import { describe, expect, it, vi } from 'vitest';

import {
  getDiagnosticRevealFacts,
  getDiagnosticReviewFacts,
  getPlacementContext,
} from '../diagnostic-reveal';
import { PRACTISABLE_ITEM } from '../practisable';

vi.mock('server-only', () => ({}));

type Db = Parameters<typeof getDiagnosticRevealFacts>[0];
const dbWith = (row: unknown) => {
  const findFirst = vi.fn().mockResolvedValue(row);
  return { db: { diagnosticAttempt: { findFirst } } as unknown as Db, findFirst };
};

describe('getDiagnosticRevealFacts', () => {
  it('scopes the lookup to the owner and to COMPLETED attempts', async () => {
    const { db, findFirst } = dbWith(null);
    await getDiagnosticRevealFacts(db, { userId: 'u1', attemptId: 'da1' });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'da1',
      userId: 'u1',
      status: 'COMPLETED',
    });
  });

  it('returns null for a missing attempt or one without an assessed level', async () => {
    expect(
      await getDiagnosticRevealFacts(dbWith(null).db, { userId: 'u1', attemptId: 'x' }),
    ).toBeNull();
    const noLevel = { assessedLevel: null, answers: [] };
    expect(
      await getDiagnosticRevealFacts(dbWith(noLevel).db, { userId: 'u1', attemptId: 'x' }),
    ).toBeNull();
  });

  it('maps answers to position/axis/itemLevel/correct/dontKnow/skillTag facts in position order', async () => {
    const tag = { id: 't1', slug: 'past-simple', title: 'Past simple', category: 'GRAMMAR' };
    const { db, findFirst } = dbWith({
      assessedLevel: 'A2',
      answers: [
        {
          position: 0,
          itemLevel: 'B1',
          isCorrect: true,
          dontKnow: false,
          item: { kind: 'GRAMMAR', skillTag: tag },
        },
        {
          position: 1,
          itemLevel: 'B1',
          isCorrect: false,
          dontKnow: true,
          item: { kind: 'VOCAB', skillTag: null },
        },
      ],
    });
    const facts = await getDiagnosticRevealFacts(db, { userId: 'u1', attemptId: 'da1' });
    expect(findFirst.mock.calls[0]?.[0].select.answers.orderBy).toEqual({ position: 'asc' });
    expect(facts).toEqual({
      assessedLevel: 'A2',
      answers: [
        {
          position: 0,
          axis: 'GRAMMAR',
          itemLevel: 'B1',
          correct: true,
          dontKnow: false,
          skillTag: tag,
        },
        {
          position: 1,
          axis: 'VOCAB',
          itemLevel: 'B1',
          correct: false,
          dontKnow: true,
          skillTag: null,
        },
      ],
    });
  });
});

describe('getDiagnosticReviewFacts', () => {
  const content = {
    source: {
      stem: 'She ___ a decision.',
      choices: ['did', 'took', 'made', 'got'],
      correctIndex: 2,
    },
    localized: { explanation: { en: 'We make a decision.' } },
  };
  const row = (position: number, userAnswer: string, over: Record<string, unknown> = {}) => ({
    position,
    isCorrect: false,
    dontKnow: false,
    userAnswer,
    item: { kind: 'VOCAB', content },
    ...over,
  });

  it('scopes the lookup to the owner and to COMPLETED attempts, not to PUBLISHED questions', async () => {
    const { db, findFirst } = dbWith(null);
    expect(await getDiagnosticReviewFacts(db, { userId: 'u1', attemptId: 'da1' })).toBeNull();
    const query = findFirst.mock.calls[0]?.[0];
    expect(query.where).toEqual({ id: 'da1', userId: 'u1', status: 'COMPLETED' });
    expect(query.select).toEqual({
      answers: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          isCorrect: true,
          dontKnow: true,
          userAnswer: true,
          item: { select: { kind: true, content: true } },
        },
      },
    });
  });

  it('an attempt without answers or level still yields a review', async () => {
    const { db } = dbWith({ answers: [] });
    expect(await getDiagnosticReviewFacts(db, { userId: 'u1', attemptId: 'da1' })).toEqual({
      answers: [],
    });
  });

  it('reads the chosen option as text; an old index-shaped answer through the options', async () => {
    const { db } = dbWith({
      answers: [
        row(0, 'made', { isCorrect: true }),
        row(1, '1'),
        row(2, '7'),
        row(3, '', { dontKnow: true }),
      ],
    });
    const facts = await getDiagnosticReviewFacts(db, { userId: 'u1', attemptId: 'da1' });
    expect(facts?.answers.map((a) => [a.chosen, a.correct, a.dontKnow])).toEqual([
      ['made', true, false],
      ['took', false, false],
      // An index past today's options names nothing.
      [null, false, false],
      [null, false, true],
    ]);
  });

  it('carries the question, the current key and the explanation, or null without one', async () => {
    const { db } = dbWith({
      answers: [
        row(0, 'did'),
        row(1, 'did', { item: { kind: 'GRAMMAR', content: { source: content.source } } }),
      ],
    });
    const facts = await getDiagnosticReviewFacts(db, { userId: 'u1', attemptId: 'da1' });
    expect(facts?.answers).toEqual([
      {
        position: 0,
        axis: 'VOCAB',
        stem: 'She ___ a decision.',
        choices: ['did', 'took', 'made', 'got'],
        correctIndex: 2,
        chosen: 'did',
        correct: false,
        dontKnow: false,
        explanation: { en: 'We make a decision.' },
      },
      {
        position: 1,
        axis: 'GRAMMAR',
        stem: 'She ___ a decision.',
        choices: ['did', 'took', 'made', 'got'],
        correctIndex: 2,
        chosen: 'did',
        correct: false,
        dontKnow: false,
        explanation: null,
      },
    ]);
  });
});

describe('getPlacementContext', () => {
  type Ctx = Parameters<typeof getPlacementContext>[0];
  const setup = () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ id: 'grammar.a', cefrLevel: 'A2' }]);
    const masteries = vi.fn().mockResolvedValue([
      {
        conceptId: 'grammar.a',
        pKnown: 0.3,
        observationCount: 0,
        lastUpdatedAt: 1761170400000n,
        pForgetLambda: 0.01,
      },
    ]);
    const edges = vi.fn().mockResolvedValue([{ fromId: 'grammar.a', toId: 'grammar.b' }]);
    const db = {
      $queryRaw,
      conceptMastery: { findMany: masteries },
      conceptEdge: { findMany: edges },
    } as unknown as Ctx;
    return { db, $queryRaw, masteries, edges };
  };

  it('reads only this learner’s masteries and only prerequisite edges', async () => {
    const { db, masteries, edges } = setup();
    await getPlacementContext(db, 'u1');
    expect(masteries.mock.calls[0]?.[0].where).toEqual({ userId: 'u1' });
    expect(edges.mock.calls[0]?.[0].where).toEqual({ kind: 'PREREQUISITE' });
  });

  it('filters concepts to a PUBLISHED item with a practice question', async () => {
    const { db, $queryRaw } = setup();
    await getPlacementContext(db, 'u1');
    expect($queryRaw.mock.calls[0]?.slice(1)).toContain(PRACTISABLE_ITEM);
    expect(PRACTISABLE_ITEM.sql).toContain(`i."status" = 'PUBLISHED'`);
    expect(PRACTISABLE_ITEM.sql).toContain(`jsonb_typeof(i."content" -> 'practice') = 'object'`);
  });

  it('returns plain-number timestamps and from/to edges', async () => {
    const { db } = setup();
    expect(await getPlacementContext(db, 'u1')).toEqual({
      concepts: [{ id: 'grammar.a', cefrLevel: 'A2' }],
      masteries: [
        {
          conceptId: 'grammar.a',
          pKnown: 0.3,
          observationCount: 0,
          lastUpdatedAt: 1761170400000,
          pForgetLambda: 0.01,
        },
      ],
      prereqEdges: [{ from: 'grammar.a', to: 'grammar.b', kind: 'PREREQUISITE' }],
    });
  });
});
