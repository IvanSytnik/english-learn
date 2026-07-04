import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BKT_DEFAULTS,
  PROB_MAX,
  PROB_MIN,
  clampProb,
} from "../constants";
import { applyForgetting } from "../forgetting";
import {
  pCorrectGivenKnown,
  pKnownToTheta,
  sigmoid,
} from "../irt";
import {
  batchUpdate,
  initBktState,
  predictCorrect,
  update,
} from "../model";
import type { BktOutcome, BktState, IrtParams } from "../types";

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

describe("clampProb", () => {
  it("returns the input when within bounds", () => {
    expect(clampProb(0.5)).toBe(0.5);
  });

  it("clamps values below PROB_MIN", () => {
    expect(clampProb(0)).toBe(PROB_MIN);
    expect(clampProb(-1)).toBe(PROB_MIN);
  });

  it("clamps values above PROB_MAX", () => {
    expect(clampProb(1)).toBe(PROB_MAX);
    expect(clampProb(2)).toBe(PROB_MAX);
  });

  it("throws on NaN", () => {
    expect(() => clampProb(Number.NaN)).toThrow();
  });

  it("throws on Infinity", () => {
    expect(() => clampProb(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => clampProb(Number.NEGATIVE_INFINITY)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IRT
// ---------------------------------------------------------------------------

describe("sigmoid", () => {
  it("maps 0 to 0.5", () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
  });

  it("is monotonically increasing", () => {
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

  it("stays in (0, 1) for extreme inputs", () => {
    expect(sigmoid(1000)).toBeLessThanOrEqual(1);
    expect(sigmoid(1000)).toBeGreaterThan(0.999);
    expect(sigmoid(-1000)).toBeGreaterThanOrEqual(0);
    expect(sigmoid(-1000)).toBeLessThan(0.001);
  });
});

describe("pKnownToTheta", () => {
  it("maps 0.5 to ~0", () => {
    expect(pKnownToTheta(0.5)).toBeCloseTo(0, 10);
  });

  it("is monotonically increasing", () => {
    fc.assert(
      fc.property(probArb, probArb, (p1, p2) => {
        // Skip pairs too close to be distinguishable in double precision —
        // logit(1e-6 + 1e-22) ≡ logit(1e-6) bit-exact, and that's correct.
        if (Math.abs(p2 - p1) < 1e-9) return;
        if (p1 < p2) {
          expect(pKnownToTheta(p1)).toBeLessThanOrEqual(pKnownToTheta(p2));
        }
        }),
    );
  });
});

describe("pCorrectGivenKnown", () => {
  it("equals 0.5 when θ = b", () => {
    const item: IrtParams = { a: 1, b: 0.7 };
    expect(pCorrectGivenKnown(0.7, item)).toBeCloseTo(0.5, 6);
  });

  it("increases with θ", () => {
    const item: IrtParams = { a: 1.5, b: 0 };
    expect(pCorrectGivenKnown(-1, item)).toBeLessThan(
      pCorrectGivenKnown(1, item),
    );
  });

  it("higher b → lower p at fixed θ", () => {
    const easy: IrtParams = { a: 1, b: -1 };
    const hard: IrtParams = { a: 1, b: 2 };
    expect(pCorrectGivenKnown(0, easy)).toBeGreaterThan(
      pCorrectGivenKnown(0, hard),
    );
  });
});

// ---------------------------------------------------------------------------
// Forgetting
// ---------------------------------------------------------------------------

describe("applyForgetting", () => {
  it("returns input unchanged at Δt = 0", () => {
    expect(applyForgetting(0.7, 0.01, 0)).toBeCloseTo(0.7, 10);
  });

  it("returns input unchanged for negative Δt (clock skew defense)", () => {
    expect(applyForgetting(0.7, 0.01, -10000)).toBeCloseTo(0.7, 10);
  });

  it("returns input unchanged when λ = 0", () => {
    expect(applyForgetting(0.7, 0, 1000 * 60 * 60 * 1000)).toBeCloseTo(0.7, 10);
  });

  it("decays toward 0 as Δt → ∞", () => {
    const decayed = applyForgetting(0.9, 0.1, 1000 * 60 * 60 * 24 * 365);
    expect(decayed).toBeCloseTo(PROB_MIN, 10);
  });

  it("monotonically decreases with Δt", () => {
    const p = 0.8;
    const lambda = 0.05;
    const d1 = applyForgetting(p, lambda, 1000 * 60 * 60);
    const d2 = applyForgetting(p, lambda, 1000 * 60 * 60 * 10);
    expect(d1).toBeGreaterThan(d2);
  });

  it("respects half-life: λ=ln(2) ≈ 0.693 → halves in 1 hour", () => {
    const halved = applyForgetting(0.8, Math.log(2), 1000 * 60 * 60);
    expect(halved).toBeCloseTo(0.4, 3);
  });

  it("always returns a clamped probability", () => {
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

describe("initBktState", () => {
  it("uses global defaults", () => {
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

describe("predictCorrect", () => {
  it("returns pKnown·(1-pSlip) + (1-pKnown)·pGuess without item", () => {
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

  it("with item: uses IRT branch", () => {
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
    expect(predictCorrect(s, 1000, easy)).toBeGreaterThan(
      predictCorrect(s, 1000, hard),
    );
  });

  it("decays pKnown before computing prediction", () => {
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

  it("does not mutate input state", () => {
    const s = initBktState(0);
    const snapshot = { ...s };
    predictCorrect(s, 1_000_000);
    expect(s).toEqual(snapshot);
  });

  it("always returns a valid probability", () => {
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

describe("update", () => {
  it("correct outcome increases pKnown (no forgetting)", () => {
    const s: BktState = {
      ...initBktState(0),
      pForgetLambda: 0,
    };
    const next = update(s, makeOutcome(s, true));
    expect(next.pKnown).toBeGreaterThan(s.pKnown);
  });

  it("incorrect outcome decreases pKnown (high prior, no forgetting)", () => {
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

  it("increments observationCount", () => {
    const s = initBktState(0);
    const next = update(s, makeOutcome(s, true));
    expect(next.observationCount).toBe(1);
    const next2 = update(next, makeOutcome(next, false));
    expect(next2.observationCount).toBe(2);
  });

  it("advances lastUpdatedAt to outcome.timestamp", () => {
    const s = initBktState(1000);
    const next = update(s, makeOutcome(s, true, 5000));
    expect(next.lastUpdatedAt).toBe(6000);
  });

  it("does not mutate input state", () => {
    const s = initBktState(0);
    const snapshot = { ...s };
    update(s, makeOutcome(s, true));
    expect(s).toEqual(snapshot);
  });

  it("output pKnown is always a valid probability", () => {
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

  it("many correct outcomes drive pKnown high", () => {
    let s: BktState = { ...initBktState(0), pForgetLambda: 0 };
    for (let i = 0; i < 20; i++) {
      s = update(s, makeOutcome(s, true, 60_000));
    }
    expect(s.pKnown).toBeGreaterThan(0.9);
  });

  it("many incorrect outcomes drive pKnown low", () => {
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

describe("batchUpdate", () => {
  it("matches sequential update on sorted input", () => {
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

  it("sorts unordered outcomes by timestamp before folding", () => {
    const s0 = initBktState(0);
    const o1: BktOutcome = { correct: true, timestamp: 1000 };
    const o2: BktOutcome = { correct: false, timestamp: 2000 };
    const o3: BktOutcome = { correct: true, timestamp: 3000 };

    const ordered = batchUpdate(s0, [o1, o2, o3]);
    const shuffled = batchUpdate(s0, [o3, o1, o2]);

    expect(shuffled.pKnown).toBeCloseTo(ordered.pKnown, 10);
    expect(shuffled.lastUpdatedAt).toBe(3000);
  });

  it("returns state unchanged for empty outcome list", () => {
    const s = initBktState(1000);
    expect(batchUpdate(s, [])).toEqual(s);
  });

  it("does not mutate the input outcomes array", () => {
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