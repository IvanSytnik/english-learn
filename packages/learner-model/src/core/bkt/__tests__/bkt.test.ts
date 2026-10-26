import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BKT_DEFAULTS, clampProb, PROB_MAX, PROB_MIN, THETA_KNOWN } from '../constants';
import { applyForgetting } from '../forgetting';
import { pCorrectGivenKnown, sigmoid } from '../irt';
import { batchUpdate, initBktState, predictCorrect, update } from '../model';
import type { BktOutcome, BktState, IrtParams } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const probArb = fc.double({
  min: PROB_MIN,
  max: PROB_MAX,
  noNaN: true,
  noDefaultInfinity: true,
});

const stateArb: fc.Arbitrary<BktState> = fc.record({
  pKnown: probArb,
  pLearn: probArb,
  pSlip: probArb,
  pGuess: probArb,
  pForgetLambda: fc.double({
    min: 0,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  lastUpdatedAt: fc.integer({ min: 0, max: 1_700_000_000_000 }),
  observationCount: fc.nat({ max: 1000 }),
});

const itemArb: fc.Arbitrary<IrtParams> = fc.record({
  a: fc.double({ min: 0.1, max: 3, noNaN: true, noDefaultInfinity: true }),
  b: fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }),
});

function makeOutcome(
  state: BktState,
  correct: boolean,
  deltaMs = 60_000,
  item?: IrtParams,
): BktOutcome {
  return {
    correct,
    timestamp: state.lastUpdatedAt + deltaMs,
    item,
  };
}

// ---------------------------------------------------------------------------
// constants / clampProb
// ---------------------------------------------------------------------------

describe('clampProb', () => {
  it('returns the input when within bounds', () => {
    expect(clampProb(0.5)).toBe(0.5);
  });

  it('clamps values below PROB_MIN', () => {
    expect(clampProb(0)).toBe(PROB_MIN);
    expect(clampProb(-1)).toBe(PROB_MIN);
  });

  it('clamps values above PROB_MAX', () => {
    expect(clampProb(1)).toBe(PROB_MAX);
    expect(clampProb(2)).toBe(PROB_MAX);
  });

  it('throws on NaN', () => {
    expect(() => clampProb(Number.NaN)).toThrow();
  });

  it('throws on Infinity', () => {
    expect(() => clampProb(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => clampProb(Number.NEGATIVE_INFINITY)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IRT
// ---------------------------------------------------------------------------

describe('sigmoid', () => {
  it('maps 0 to 0.5', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
  });

  it('is monotonically increasing', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.001, max: 5, noNaN: true, noDefaultInfinity: true }),
        (x, dx) => {
          expect(sigmoid(x + dx)).toBeGreaterThan(sigmoid(x));
        },
      ),
    );
  });

  it('stays in (0, 1) for extreme inputs', () => {
    expect(sigmoid(1000)).toBeLessThanOrEqual(1);
    expect(sigmoid(1000)).toBeGreaterThan(0.999);
    expect(sigmoid(-1000)).toBeGreaterThanOrEqual(0);
    expect(sigmoid(-1000)).toBeLessThan(0.001);
  });
});

describe('pCorrectGivenKnown (4PL, §8 #19)', () => {
  it('sits halfway between pGuess and 1 − pSlip when b = θ_K', () => {
    const item: IrtParams = { a: 1.7, b: THETA_KNOWN };
    expect(pCorrectGivenKnown(item, 0.1, 0.25)).toBeCloseTo((0.25 + 0.9) / 2, 10);
  });

  it('increases with θ_K', () => {
    const item: IrtParams = { a: 1.5, b: 0 };
    expect(pCorrectGivenKnown(item, 0.1, 0.25, -1)).toBeLessThan(
      pCorrectGivenKnown(item, 0.1, 0.25, 1),
    );
  });

  it('higher b → lower p', () => {
    const easy: IrtParams = { a: 1, b: -1 };
    const hard: IrtParams = { a: 1, b: 2 };
    expect(pCorrectGivenKnown(easy, 0.1, 0.25)).toBeGreaterThan(
      pCorrectGivenKnown(hard, 0.1, 0.25),
    );
  });
});

// ---------------------------------------------------------------------------
// Observation-model invariants (§8 #19). The old likelihood σ(a(logit(pKnown)
// − b)) fell below pGuess for b > 0 or a cold prior, and a right answer then
// LOWERED pKnown. A correct answer raises the posterior iff
// P(correct | known) > pGuess, so invariant 1 is the root of 2–4.
// ---------------------------------------------------------------------------

/** Away from the clamp bounds, where PROB_MAX would turn ">" into "=". */
const priorArb = fc.double({ min: 1e-3, max: 1 - 1e-3, noNaN: true, noDefaultInfinity: true });

/** Non-degenerate BKT params: 1 − pSlip exceeds pGuess by a usable margin. */
const paramsArb = fc
  .record({
    pSlip: fc.double({ min: 0.01, max: 0.3, noNaN: true, noDefaultInfinity: true }),
    pGuess: fc.double({ min: 0.01, max: 0.5, noNaN: true, noDefaultInfinity: true }),
    pLearn: fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
  })
  .filter(({ pSlip, pGuess }) => 1 - pSlip - pGuess >= 0.05);

const stateAt = (pKnown: number, params: { pSlip: number; pGuess: number; pLearn: number }) => ({
  ...initBktState(0),
  ...params,
  pKnown,
});

const answer = (state: BktState, correct: boolean, item: IrtParams) =>
  update(state, { correct, timestamp: 60_000, item }).pKnown;

describe('observation model invariants (§8 #19)', () => {
  it('1. likelihood: pGuess < P(correct | known) < 1 − pSlip for every a, b', () => {
    fc.assert(
      fc.property(itemArb, paramsArb, (item, { pSlip, pGuess }) => {
        const s = pCorrectGivenKnown(item, pSlip, pGuess);
        expect(s).toBeGreaterThan(pGuess);
        expect(s).toBeLessThan(1 - pSlip);
      }),
    );
  });

  it('2. evidence: before learning, a right answer raises the prior and a miss lowers it', () => {
    fc.assert(
      fc.property(priorArb, itemArb, paramsArb, (p, item, params) => {
        // pLearn = 0 isolates the Bayes step from the learning transition.
        const s = stateAt(p, { ...params, pLearn: 0 });
        expect(answer(s, true, item)).toBeGreaterThan(p);
        expect(answer(s, false, item)).toBeLessThan(p);
      }),
    );
  });

  it('3. result: a right answer strictly raises pKnown and beats a miss', () => {
    fc.assert(
      fc.property(priorArb, itemArb, paramsArb, (p, item, params) => {
        const s = stateAt(p, params);
        const right = answer(s, true, item);
        expect(right).toBeGreaterThan(p);
        expect(right).toBeGreaterThan(answer(s, false, item));
      }),
    );
  });

  it('4. monotone in b: a harder item gives no larger gain on a right answer and no larger drop on a miss', () => {
    const bArb = fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(
        priorArb,
        fc.double({ min: 0.1, max: 3, noNaN: true, noDefaultInfinity: true }),
        bArb,
        bArb,
        paramsArb,
        (p, a, b1, b2, params) => {
          const [easy, hard] = b1 <= b2 ? [b1, b2] : [b2, b1];
          const s = stateAt(p, params);
          // 1e-12 absorbs rounding when easy ≈ hard.
          expect(answer(s, true, { a, b: hard })).toBeLessThanOrEqual(
            answer(s, true, { a, b: easy }) + 1e-12,
          );
          expect(answer(s, false, { a, b: hard })).toBeGreaterThanOrEqual(
            answer(s, false, { a, b: easy }) - 1e-12,
          );
        },
      ),
    );
  });

  it('§8 #19 regressions: b > 0 no longer traps a cold learner or pushes a B1 prior down', () => {
    // Before: a cold learner stuck at 0.16 with b = 0.6; B1 prior 0.26 → 0.19 with b = 1.0.
    let s: BktState = initBktState(0);
    for (let i = 0; i < 5; i++)
      s = update(s, { correct: true, timestamp: i, item: { a: 1, b: 0.6 } });
    expect(s.pKnown).toBeGreaterThan(0.7);

    const b1 = { ...initBktState(0), pKnown: 0.26 };
    expect(answer(b1, true, { a: 1, b: 1 })).toBeGreaterThan(0.26);
  });
});

// ---------------------------------------------------------------------------
// Forgetting
// ---------------------------------------------------------------------------

describe('applyForgetting', () => {
  it('returns input unchanged at Δt = 0', () => {
    expect(applyForgetting(0.7, 0.01, 0)).toBeCloseTo(0.7, 10);
  });

  it('returns input unchanged for negative Δt (clock skew defense)', () => {
    expect(applyForgetting(0.7, 0.01, -10000)).toBeCloseTo(0.7, 10);
  });

  it('returns input unchanged when λ = 0', () => {
    expect(applyForgetting(0.7, 0, 1000 * 60 * 60 * 1000)).toBeCloseTo(0.7, 10);
  });

  it('decays toward 0 as Δt → ∞', () => {
    const decayed = applyForgetting(0.9, 0.1, 1000 * 60 * 60 * 24 * 365);
    expect(decayed).toBeCloseTo(PROB_MIN, 10);
  });

  it('monotonically decreases with Δt', () => {
    const p = 0.8;
    const lambda = 0.05;
    const d1 = applyForgetting(p, lambda, 1000 * 60 * 60);
    const d2 = applyForgetting(p, lambda, 1000 * 60 * 60 * 10);
    expect(d1).toBeGreaterThan(d2);
  });

  it('respects half-life: λ=ln(2) ≈ 0.693 → halves in 1 hour', () => {
    const halved = applyForgetting(0.8, Math.log(2), 1000 * 60 * 60);
    expect(halved).toBeCloseTo(0.4, 3);
  });

  it('always returns a clamped probability', () => {
    fc.assert(
      fc.property(
        probArb,
        fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1000 * 60 * 60 * 24 * 365 }),
        (p, lambda, dt) => {
          const out = applyForgetting(p, lambda, dt);
          expect(out).toBeGreaterThanOrEqual(PROB_MIN);
          expect(out).toBeLessThanOrEqual(PROB_MAX);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// initBktState
// ---------------------------------------------------------------------------

describe('initBktState', () => {
  it('uses global defaults', () => {
    const s = initBktState(1000);
    expect(s.pKnown).toBe(BKT_DEFAULTS.pKnownInit);
    expect(s.pLearn).toBe(BKT_DEFAULTS.pLearn);
    expect(s.pSlip).toBe(BKT_DEFAULTS.pSlip);
    expect(s.pGuess).toBe(BKT_DEFAULTS.pGuess);
    expect(s.pForgetLambda).toBe(BKT_DEFAULTS.pForgetLambda);
    expect(s.lastUpdatedAt).toBe(1000);
    expect(s.observationCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// predictCorrect
// ---------------------------------------------------------------------------

describe('predictCorrect', () => {
  it('returns pKnown·(1-pSlip) + (1-pKnown)·pGuess without item', () => {
    const s: BktState = {
      pKnown: 0.6,
      pLearn: 0.1,
      pSlip: 0.1,
      pGuess: 0.2,
      pForgetLambda: 0,
      lastUpdatedAt: 1000,
      observationCount: 0,
    };
    const expected = 0.6 * 0.9 + 0.4 * 0.2;
    expect(predictCorrect(s, 1000)).toBeCloseTo(expected, 10);
  });

  it('with item: uses IRT branch', () => {
    const s: BktState = {
      pKnown: 0.8,
      pLearn: 0.1,
      pSlip: 0.1,
      pGuess: 0.25,
      pForgetLambda: 0,
      lastUpdatedAt: 1000,
      observationCount: 0,
    };
    const easy: IrtParams = { a: 1, b: -5 };
    const hard: IrtParams = { a: 1, b: 5 };
    expect(predictCorrect(s, 1000, easy)).toBeGreaterThan(predictCorrect(s, 1000, hard));
  });

  it('with item: the same 4PL observation model as update (§8 #19)', () => {
    const s: BktState = { ...initBktState(1000), pKnown: 0.3, pForgetLambda: 0 };
    const item: IrtParams = { a: 1.2, b: 1.5 };
    const known = pCorrectGivenKnown(item, s.pSlip, s.pGuess);
    expect(predictCorrect(s, 1000, item)).toBeCloseTo(0.3 * known + 0.7 * s.pGuess, 12);
  });

  it('decays pKnown before computing prediction', () => {
    const s: BktState = {
      pKnown: 0.9,
      pLearn: 0.1,
      pSlip: 0.1,
      pGuess: 0.25,
      pForgetLambda: 0.5,
      lastUpdatedAt: 1000,
      observationCount: 0,
    };
    const fresh = predictCorrect(s, 1000);
    const stale = predictCorrect(s, 1000 + 1000 * 60 * 60 * 100);
    expect(stale).toBeLessThan(fresh);
  });

  it('does not mutate input state', () => {
    const s = initBktState(0);
    const snapshot = { ...s };
    predictCorrect(s, 1_000_000);
    expect(s).toEqual(snapshot);
  });

  it('always returns a valid probability', () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        fc.option(itemArb, { nil: undefined }),
        (s, now, item) => {
          const p = predictCorrect(s, now, item ?? undefined);
          expect(p).toBeGreaterThanOrEqual(PROB_MIN);
          expect(p).toBeLessThanOrEqual(PROB_MAX);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// update — monotonicity & invariants
// ---------------------------------------------------------------------------

describe('update', () => {
  it('correct outcome increases pKnown (no forgetting)', () => {
    const s: BktState = {
      ...initBktState(0),
      pForgetLambda: 0,
    };
    const next = update(s, makeOutcome(s, true));
    expect(next.pKnown).toBeGreaterThan(s.pKnown);
  });

  it('incorrect outcome decreases pKnown (high prior, no forgetting)', () => {
    const s: BktState = {
      ...initBktState(0),
      pKnown: 0.8,
      pForgetLambda: 0,
    };
    const next = update(s, makeOutcome(s, false));
    // Incorrect should reduce posterior; learning transition can raise it back
    // a bit, but with pLearn=0.1 the net effect on pKnown=0.8 is downward.
    expect(next.pKnown).toBeLessThan(s.pKnown);
  });

  it('increments observationCount', () => {
    const s = initBktState(0);
    const next = update(s, makeOutcome(s, true));
    expect(next.observationCount).toBe(1);
    const next2 = update(next, makeOutcome(next, false));
    expect(next2.observationCount).toBe(2);
  });

  it('advances lastUpdatedAt to outcome.timestamp', () => {
    const s = initBktState(1000);
    const next = update(s, makeOutcome(s, true, 5000));
    expect(next.lastUpdatedAt).toBe(6000);
  });

  it('does not mutate input state', () => {
    const s = initBktState(0);
    const snapshot = { ...s };
    update(s, makeOutcome(s, true));
    expect(s).toEqual(snapshot);
  });

  it('output pKnown is always a valid probability', () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.boolean(),
        fc.integer({ min: 0, max: 1000 * 60 * 60 * 24 * 30 }),
        fc.option(itemArb, { nil: undefined }),
        (s, correct, deltaMs, item) => {
          const outcome: BktOutcome = {
            correct,
            timestamp: s.lastUpdatedAt + deltaMs,
            item: item ?? undefined,
          };
          const next = update(s, outcome);
          expect(next.pKnown).toBeGreaterThanOrEqual(PROB_MIN);
          expect(next.pKnown).toBeLessThanOrEqual(PROB_MAX);
        },
      ),
    );
  });

  it('ignores elapsed time: the same outcome after any gap gives the same pKnown (§8 #10)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.boolean(),
        fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }),
        (pKnown, correct, gapMs) => {
          const s: BktState = { ...initBktState(0), pKnown, pForgetLambda: 0.01 };
          const now = update(s, { correct, timestamp: 0 });
          const later = update(s, { correct, timestamp: gapMs });
          expect(later.pKnown).toBe(now.pKnown);
        },
      ),
    );
  });

  it('day-spaced correct answers reach the 0.70 gate (default params, §8 #10)', () => {
    // With an IRT item, as every production outcome has: the IRT branch is
    // where the old decay pinned pKnown near 0.18.
    const item = { a: 1, b: 0 };
    let s: BktState = initBktState(0);
    let answers = 0;
    while (s.pKnown < 0.7 && answers < 20) {
      answers += 1;
      s = update(s, { correct: true, timestamp: answers * 2 * 86_400_000, item });
    }
    expect(s.pKnown).toBeGreaterThanOrEqual(0.7);
    expect(answers).toBeLessThanOrEqual(10);
  });

  it('many correct outcomes drive pKnown high', () => {
    let s: BktState = { ...initBktState(0), pForgetLambda: 0 };
    for (let i = 0; i < 20; i++) {
      s = update(s, makeOutcome(s, true, 60_000));
    }
    expect(s.pKnown).toBeGreaterThan(0.9);
  });

  it('many incorrect outcomes drive pKnown low', () => {
    let s: BktState = {
      ...initBktState(0),
      pKnown: 0.5,
      pForgetLambda: 0,
    };
    for (let i = 0; i < 20; i++) {
      s = update(s, makeOutcome(s, false, 60_000));
    }
    // pLearn raises floor; with pLearn=0.1, asymptote is ~pLearn-ish, not 0.
    expect(s.pKnown).toBeLessThan(0.2);
  });
});

// ---------------------------------------------------------------------------
// batchUpdate
// ---------------------------------------------------------------------------

describe('batchUpdate', () => {
  it('matches sequential update on sorted input', () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.array(
          fc.record({
            correct: fc.boolean(),
            deltaMs: fc.integer({ min: 1, max: 1000 * 60 * 60 }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (s0, steps) => {
          // Build outcomes with strictly increasing timestamps.
          const outcomes: BktOutcome[] = [];
          let t = s0.lastUpdatedAt;
          for (const step of steps) {
            t += step.deltaMs;
            outcomes.push({ correct: step.correct, timestamp: t });
          }

          const viaBatch = batchUpdate(s0, outcomes);
          const viaFold = outcomes.reduce(update, s0);

          expect(viaBatch.pKnown).toBeCloseTo(viaFold.pKnown, 10);
          expect(viaBatch.observationCount).toBe(viaFold.observationCount);
          expect(viaBatch.lastUpdatedAt).toBe(viaFold.lastUpdatedAt);
        },
      ),
    );
  });

  it('sorts unordered outcomes by timestamp before folding', () => {
    const s0 = initBktState(0);
    const o1: BktOutcome = { correct: true, timestamp: 1000 };
    const o2: BktOutcome = { correct: false, timestamp: 2000 };
    const o3: BktOutcome = { correct: true, timestamp: 3000 };

    const ordered = batchUpdate(s0, [o1, o2, o3]);
    const shuffled = batchUpdate(s0, [o3, o1, o2]);

    expect(shuffled.pKnown).toBeCloseTo(ordered.pKnown, 10);
    expect(shuffled.lastUpdatedAt).toBe(3000);
  });

  it('returns state unchanged for empty outcome list', () => {
    const s = initBktState(1000);
    expect(batchUpdate(s, [])).toEqual(s);
  });

  it('does not mutate the input outcomes array', () => {
    const s = initBktState(0);
    const outcomes: BktOutcome[] = [
      { correct: true, timestamp: 3000 },
      { correct: false, timestamp: 1000 },
      { correct: true, timestamp: 2000 },
    ];
    const snapshot = outcomes.map((o) => ({ ...o }));
    batchUpdate(s, outcomes);
    expect(outcomes).toEqual(snapshot);
  });
});
