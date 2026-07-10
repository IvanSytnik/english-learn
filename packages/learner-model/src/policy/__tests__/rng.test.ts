import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeRng, sampleBeta } from "../rng";

describe("makeRng", () => {
  it("is deterministic: same seed => same sequence", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = makeRng(seed);
        const b = makeRng(seed);
        for (let i = 0; i < 50; i++) {
          expect(a.next()).toBe(b.next());
        }
      }),
    );
  });

  it("produces values in [0,1)", () => {
    const rng = makeRng(12345);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differed = false;
    for (let i = 0; i < 10; i++) {
      if (a.next() !== b.next()) differed = true;
    }
    expect(differed).toBe(true);
  });
});

describe("sampleBeta", () => {
  it("is deterministic under a fixed seed", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (seed, alpha, beta) => {
          const s1 = sampleBeta(makeRng(seed), alpha, beta);
          const s2 = sampleBeta(makeRng(seed), alpha, beta);
          expect(s1).toBe(s2);
        },
      ),
    );
  });

  it("always returns a value in (0,1)", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        (seed, alpha, beta) => {
          const v = sampleBeta(makeRng(seed), alpha, beta);
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        },
      ),
    );
  });

  it("empirical mean approximates alpha/(alpha+beta)", () => {
    // Beta(2,8) has mean 0.2. Average many draws from ONE stream.
    const rng = makeRng(777);
    const N = 20_000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(rng, 2, 8);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.17);
    expect(mean).toBeLessThan(0.23);
  });

  it("higher alpha shifts mean upward", () => {
    const rng = makeRng(999);
    const N = 10_000;
    let lowSum = 0;
    let highSum = 0;
    for (let i = 0; i < N; i++) lowSum += sampleBeta(rng, 1, 9);
    for (let i = 0; i < N; i++) highSum += sampleBeta(rng, 9, 1);
    expect(highSum / N).toBeGreaterThan(lowSum / N);
  });
});
