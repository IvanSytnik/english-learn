import { describe, expect, it, vi } from 'vitest';

import { getDiagnosticRevealFacts } from '../diagnostic-reveal';

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
    const noLevel = { assessedLevel: null, levelTrajectory: [], answers: [] };
    expect(
      await getDiagnosticRevealFacts(dbWith(noLevel).db, { userId: 'u1', attemptId: 'x' }),
    ).toBeNull();
  });

  it('maps answers to axis/correct/dontKnow/skillTag facts in position order', async () => {
    const tag = { id: 't1', slug: 'past-simple', title: 'Past simple', category: 'GRAMMAR' };
    const { db, findFirst } = dbWith({
      assessedLevel: 'A2',
      levelTrajectory: ['B1', 'A2'],
      answers: [
        { isCorrect: true, dontKnow: false, item: { kind: 'GRAMMAR', skillTag: tag } },
        { isCorrect: false, dontKnow: true, item: { kind: 'VOCAB', skillTag: null } },
      ],
    });
    const facts = await getDiagnosticRevealFacts(db, { userId: 'u1', attemptId: 'da1' });
    expect(findFirst.mock.calls[0]?.[0].select.answers.orderBy).toEqual({ position: 'asc' });
    expect(facts).toEqual({
      assessedLevel: 'A2',
      levelTrajectory: ['B1', 'A2'],
      answers: [
        { axis: 'GRAMMAR', correct: true, dontKnow: false, skillTag: tag },
        { axis: 'VOCAB', correct: false, dontKnow: true, skillTag: null },
      ],
    });
  });
});
