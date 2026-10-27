import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type LevelGuardOutcome, levelGuard } from '../level-guard';
import { DEFAULT_POLICY_CONFIG } from '../types';

// CEFR ranks (core/graph CEFR_RANK): A2 1, B1 2, B2 3, C1 4. Content A2..B2.
const A2 = 1;
const B1 = 2;
const B2 = 3;
const C1 = 4;
const config = DEFAULT_POLICY_CONFIG.levelPolicy.guard;

const at = (rank: number, answers: string): LevelGuardOutcome[] =>
  [...answers].map((a) => ({ rank, correct: a === '1' }));
const guard = (placedRank: number, outcomes: readonly LevelGuardOutcome[]) =>
  levelGuard({ placedRank, outcomes, minRank: A2, maxRank: B2, config });

describe('levelGuard — the calibrated parameters', () => {
  it('are G1 streak 4, G2 first 7 < 4 right, recovery 12 at ≥ 0.85', () => {
    expect(config).toEqual({ streak: 4, early: { n: 7, min: 4 }, recover: { n: 12, min: 0.85 } });
  });
});

describe('levelGuard — no evidence', () => {
  it('stays at the placement without outcomes', () => {
    expect(guard(B1, [])).toEqual({ theta: B1, targetRank: B1, downs: 0, ups: 0 });
  });

  it('ignores answers at other levels: no streak, no window', () => {
    expect(guard(B1, [...at(A2, '0000000'), ...at(B2, '0000000')]).theta).toBe(B1);
  });
});

describe('levelGuard — G1: misses in a row', () => {
  it('4 misses in a row at the target step down one level', () => {
    // Past the first 7 so G2 is out of the way: 7 right, then 4 misses.
    expect(guard(B1, at(B1, '1111111' + '0000'))).toMatchObject({ theta: A2, downs: 1 });
  });

  it('3 misses in a row do not', () => {
    expect(guard(B1, at(B1, '1111111' + '000')).theta).toBe(B1);
  });

  it('a right answer resets the streak', () => {
    expect(guard(B1, at(B1, '1111111' + '000' + '1' + '000')).theta).toBe(B1);
  });
});

describe('levelGuard — G2: the first 7 answers at a level', () => {
  it('3 right of the first 7 step down', () => {
    expect(guard(B1, at(B1, '1010100'))).toMatchObject({ theta: A2, downs: 1 });
  });

  it('4 right of the first 7 hold the level', () => {
    expect(guard(B1, at(B1, '1010101')).theta).toBe(B1);
  });

  it('is judged once, at exactly 7: later answers are G1’s business', () => {
    // 4 of the first 7, then a weak stretch that never reaches 4 misses in a row.
    expect(guard(B1, at(B1, '1010101' + '0010010')).theta).toBe(B1);
  });
});

describe('levelGuard — hints', () => {
  const hintedRight: LevelGuardOutcome = { rank: B1, correct: true, hinted: true };

  it('a correct hinted answer is skipped: it neither resets the streak nor counts', () => {
    const outcomes = [...at(B1, '1111111' + '000'), hintedRight, ...at(B1, '0')];
    expect(guard(B1, outcomes).theta).toBe(A2);
  });

  it('a hinted miss counts as a miss', () => {
    const outcomes = [...at(B1, '1111111' + '000'), { rank: B1, correct: false, hinted: true }];
    expect(guard(B1, outcomes).theta).toBe(A2);
  });
});

describe('levelGuard — recovery', () => {
  const down = at(B1, '0000'); // G1 at the start: B1 → A2

  it('11 of 12 right at the lowered level step back up to the placement', () => {
    expect(guard(B1, [...down, ...at(A2, '111110111111')])).toMatchObject({
      theta: B1,
      downs: 1,
      ups: 1,
    });
  });

  it('10 of 12 (0.83) do not', () => {
    expect(guard(B1, [...down, ...at(A2, '110111011111')]).theta).toBe(A2);
  });

  it('the rate is inclusive: exactly `min` steps up (custom n = 4, min = 0.75)', () => {
    const tight = { ...config, recover: { n: 4, min: 0.75 } };
    const run = (answers: string) =>
      levelGuard({
        placedRank: B1,
        outcomes: [...down, ...at(A2, answers)],
        minRank: A2,
        maxRank: B2,
        config: tight,
      }).theta;
    expect(run('1101')).toBe(B1); // 3 of 4 = 0.75
    expect(run('1001')).toBe(A2); // 2 of 4
  });

  it('never above the placement', () => {
    expect(guard(B1, at(B1, '1'.repeat(40))).theta).toBe(B1);
  });

  it('a move resets the windows: the new level starts its own first 7', () => {
    // Down to A2, then 3 of 7 at A2 — but A2 is the floor, so nothing moves.
    expect(guard(B1, [...down, ...at(A2, '1010100')])).toMatchObject({ theta: A2, downs: 1 });
  });
});

describe('levelGuard — bounds', () => {
  it('never below the lowest level with content', () => {
    expect(guard(A2, at(A2, '0'.repeat(20)))).toMatchObject({ theta: A2, downs: 0 });
  });

  it('C1 aims at the top content level, and a step down from there lands on B1', () => {
    expect(guard(C1, [])).toMatchObject({ theta: C1, targetRank: B2 });
    expect(guard(C1, at(B2, '0000'))).toMatchObject({ theta: B1, targetRank: B1, downs: 1 });
  });

  it('C1 answers at B2 only count: C1 has no content to answer', () => {
    expect(guard(C1, at(C1, '0000')).theta).toBe(C1);
  });
});

describe('levelGuard — properties', () => {
  const outcome = fc.record({
    rank: fc.constantFrom(A2, B1, B2),
    correct: fc.boolean(),
    hinted: fc.boolean(),
  });

  it('pure, within [lowest content level, max(placement, lowest)], target capped at the content', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(A2, B1, B2, C1),
        fc.array(outcome, { maxLength: 80 }),
        (placed, outcomes) => {
          const a = guard(placed, outcomes);
          expect(guard(placed, outcomes)).toEqual(a);
          expect(a.theta).toBeGreaterThanOrEqual(A2);
          expect(a.theta).toBeLessThanOrEqual(placed);
          expect(a.targetRank).toBe(Math.min(a.theta, B2));
          expect(a.ups).toBeLessThanOrEqual(a.downs);
        },
      ),
    );
  });
});
