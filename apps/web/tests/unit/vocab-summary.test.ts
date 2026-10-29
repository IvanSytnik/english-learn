import { describe, expect, it } from 'vitest';
import { summarizeVocabSession } from '@/lib/vocab-summary';

describe('summarizeVocabSession', () => {
  it('counts right answers, words back soon, and proofs', () => {
    expect(
      summarizeVocabSession([
        { verdict: 'correct', proven: false },
        { verdict: 'correct', proven: true },
        { verdict: 'incorrect', proven: false },
        { verdict: 'dontKnow', proven: false },
      ]),
    ).toEqual({ answered: 4, correct: 2, again: 2, proven: 1 });
  });

  it('an empty session is all zeros', () => {
    expect(summarizeVocabSession([])).toEqual({ answered: 0, correct: 0, again: 0, proven: 0 });
  });
});
