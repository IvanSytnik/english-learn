import { describe, expect, it } from 'vitest';
import { type SessionEntry, summarizeSession, toSessionEntry } from '@/lib/exercise/summary';
import type { ExerciseFeedback } from '@/lib/exercise/view';

const entry = (over: Partial<SessionEntry>): SessionEntry => ({
  conceptTitle: 'Past Simple',
  verdict: 'correct',
  crossed: null,
  review: { kind: 'backInDays', days: 3 },
  ...over,
});

describe('toSessionEntry', () => {
  const feedback: ExerciseFeedback = {
    verdict: 'correct',
    chosenIndex: 3,
    correctIndex: 3,
    correctAnswer: 'went',
    answerSentence: 'Last summer we went to Spain.',
    why: 'Irregular past.',
    more: 'Usage note.',
    consequence: { kind: 'stageCrossed', concept: 'Past Simple', stage: 'SOLID' },
    review: { kind: 'backInDays', days: 3 },
  };

  it('keeps only the summary fields: no answer, key or prompt crosses into the summary', () => {
    const e = toSessionEntry('Past Simple', feedback);
    expect(Object.keys(e).sort()).toEqual(['conceptTitle', 'crossed', 'review', 'verdict']);
    expect(JSON.stringify(e)).not.toMatch(/went|correctIndex|correctAnswer|Spain/);
  });

  it('a stage crossing keeps its review', () => {
    expect(toSessionEntry('Past Simple', feedback)).toEqual({
      conceptTitle: 'Past Simple',
      verdict: 'correct',
      crossed: 'SOLID',
      review: { kind: 'backInDays', days: 3 },
    });
  });
});

describe('summarizeSession', () => {
  it('counts verdicts', () => {
    const s = summarizeSession([
      entry({}),
      entry({ verdict: 'incorrect' }),
      entry({ verdict: 'dontKnow' }),
      entry({ verdict: 'dontKnow' }),
    ]);
    expect([s.answered, s.correct, s.incorrect, s.dontKnow]).toEqual([4, 1, 1, 2]);
  });

  it('keeps the highest stage per concept, in order of first crossing', () => {
    const s = summarizeSession([
      entry({ conceptTitle: 'Articles', crossed: 'DEVELOPING' }),
      entry({ conceptTitle: 'Past Simple', crossed: 'DEVELOPING' }),
      entry({ conceptTitle: 'Articles', crossed: 'SOLID' }),
      entry({ conceptTitle: 'Plural nouns' }),
    ]);
    expect(s.stageUps).toEqual([
      { concept: 'Articles', stage: 'SOLID' },
      { concept: 'Past Simple', stage: 'DEVELOPING' },
    ]);
  });

  it("groups reviews by concept, using the concept's last answer", () => {
    const s = summarizeSession([
      entry({ conceptTitle: 'Past Simple', review: { kind: 'backSoon' } }),
      entry({ conceptTitle: 'Articles', review: { kind: 'backInDays', days: 5 } }),
      entry({ conceptTitle: 'Plural nouns', review: { kind: 'backInDays', days: 1 } }),
      entry({ conceptTitle: 'Past Simple', review: { kind: 'backInDays', days: 1 } }),
      entry({ conceptTitle: 'Modal verbs', review: { kind: 'backSoon' } }),
    ]);
    expect(s.backSoon).toEqual(['Modal verbs']);
    expect(s.backLater).toEqual([
      { days: 1, concepts: ['Past Simple', 'Plural nouns'] },
      { days: 5, concepts: ['Articles'] },
    ]);
  });

  it('a concept that moved up still shows when it comes back', () => {
    const s = summarizeSession([
      entry({ crossed: 'SOLID', review: { kind: 'backInDays', days: 4 } }),
    ]);
    expect(s.stageUps).toEqual([{ concept: 'Past Simple', stage: 'SOLID' }]);
    expect(s.backLater).toEqual([{ days: 4, concepts: ['Past Simple'] }]);
  });

  it('an empty session is all zeros', () => {
    expect(summarizeSession([])).toEqual({
      answered: 0,
      correct: 0,
      incorrect: 0,
      dontKnow: 0,
      stageUps: [],
      backSoon: [],
      backLater: [],
    });
  });
});
