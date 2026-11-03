import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_MAX_WORDS,
  EXAMPLE_MIN_WORDS,
  easyWordShare,
  exampleWords,
  INFLECTING_POS,
  normalizeSentence,
  targetPosition,
} from '../example-checks';

describe('example checks (B6.4a)', () => {
  it('counts words, not punctuation; the limits are 6..18', () => {
    expect(exampleWords('Tom — my friend — runs fast, really fast!')).toHaveLength(7);
    expect(exampleWords("It's 7 a.m. now.")).toEqual(["It's", '7', 'a.m.', 'now.']);
    expect([EXAMPLE_MIN_WORDS, EXAMPLE_MAX_WORDS]).toEqual([6, 18]);
  });

  it('normalizes case, punctuation and spaces', () => {
    expect(normalizeSentence('  Hi,   Tom!  ')).toBe(normalizeSentence('hi tom'));
    expect(normalizeSentence("Don't go.")).toBe("don't go");
    expect(normalizeSentence('Ｔｏｍ')).toBe('tom');
  });

  it('places the target at the start, in the middle or at the end; absent → null', () => {
    expect(targetPosition('Running is fun for me.', 'running')).toBe('start');
    expect(targetPosition('"Run!" she said.', 'Run')).toBe('start');
    expect(targetPosition('I like running in the park.', 'running')).toBe('middle');
    expect(targetPosition('We went for a run.', 'run')).toBe('end');
    expect(targetPosition('We went for a rerun.', 'run')).toBeNull();
  });

  it('inflecting parts of speech: noun, verb, adjective, phrasal verb', () => {
    expect([...INFLECTING_POS].sort()).toEqual(['ADJECTIVE', 'NOUN', 'PHRASAL_VERB', 'VERB']);
  });

  it('easy share: words at most one level above, naive stems, numbers count, unknowns do not', () => {
    const levels: Record<string, 'A1' | 'A2' | 'B1' | 'B2'> = {
      i: 'A1',
      like: 'A1',
      apple: 'A1',
      cook: 'A2',
      delicious: 'B1',
      negotiate: 'B2',
    };
    const levelOf = (k: string) => levels[k];
    // i, like, cook(ing) A2, apples → apple; "Zorro" unknown: 4/5.
    expect(easyWordShare('I like cooking apples, Zorro.', 'A1', levelOf)).toBeCloseTo(4 / 5);
    // delicious B1 is two above A1, fine for A2.
    expect(easyWordShare('I like delicious apples', 'A1', levelOf)).toBeCloseTo(3 / 4);
    expect(easyWordShare('I like delicious apples', 'A2', levelOf)).toBe(1);
    expect(easyWordShare('I negotiate 3 times', 'A2', levelOf)).toBeCloseTo(2 / 4);
    expect(easyWordShare('', 'A1', levelOf)).toBe(0);
  });
});
