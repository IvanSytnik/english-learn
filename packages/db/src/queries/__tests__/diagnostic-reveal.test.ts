import { describe, expect, it, vi } from 'vitest';

import { getDiagnosticRevealFacts, getPlacementContext } from '../diagnostic-reveal';

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
    const sql = ($queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('?');
    expect(sql).toContain(`i."status" = 'PUBLISHED'`);
    expect(sql).toContain(`i."content" -> 'practice' IS NOT NULL`);
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
