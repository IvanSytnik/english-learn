import { describe, expect, it } from "vitest";
import { effectiveStrategy, rewardForOutcome } from "../reward";
import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from "../types";

const cfg = (over: Partial<PolicyConfig> = {}): PolicyConfig => ({
  ...DEFAULT_POLICY_CONFIG,
  ...over,
});

describe("effectiveStrategy (calibration gate)", () => {
  it("bernoulli stays bernoulli regardless of count", () => {
    expect(effectiveStrategy(cfg({ strategy: "bernoulli" }), 0)).toBe(
      "bernoulli",
    );
    expect(effectiveStrategy(cfg({ strategy: "bernoulli" }), 10_000)).toBe(
      "bernoulli",
    );
  });

  it("learning_gain is gated to bernoulli below the calibration gate", () => {
    const c = cfg({ strategy: "learning_gain", calibrationGate: 500 });
    expect(effectiveStrategy(c, 0)).toBe("bernoulli");
    expect(effectiveStrategy(c, 499)).toBe("bernoulli");
  });

  it("learning_gain activates at/above the gate", () => {
    const c = cfg({ strategy: "learning_gain", calibrationGate: 500 });
    expect(effectiveStrategy(c, 500)).toBe("learning_gain");
    expect(effectiveStrategy(c, 5000)).toBe("learning_gain");
  });

  it("hybrid is likewise gated", () => {
    const c = cfg({ strategy: "hybrid", calibrationGate: 200 });
    expect(effectiveStrategy(c, 199)).toBe("bernoulli");
    expect(effectiveStrategy(c, 200)).toBe("hybrid");
  });
});

describe("rewardForOutcome", () => {
  it("bernoulli: 1 for correct, 0 for incorrect", () => {
    expect(rewardForOutcome(true, 0.4, 0.6, "bernoulli", 0.5)).toBe(1);
    expect(rewardForOutcome(false, 0.4, 0.3, "bernoulli", 0.5)).toBe(0);
  });

  it("learning_gain: clamped positive delta", () => {
    expect(rewardForOutcome(true, 0.4, 0.7, "learning_gain", 0.5)).toBeCloseTo(
      0.3,
      10,
    );
    // negative gain clamps to 0
    expect(rewardForOutcome(false, 0.6, 0.4, "learning_gain", 0.5)).toBe(0);
  });

  it("hybrid blends gain and bernoulli by weight", () => {
    // w=0.5, gain=0.2, bernoulli(correct)=1 => 0.5*0.2 + 0.5*1 = 0.6
    expect(rewardForOutcome(true, 0.4, 0.6, "hybrid", 0.5)).toBeCloseTo(0.6, 10);
  });

  it("all outputs are in [0,1]", () => {
    for (const s of ["bernoulli", "learning_gain", "hybrid"] as const) {
      for (const correct of [true, false]) {
        const r = rewardForOutcome(correct, 0.1, 0.9, s, 0.5);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it("throws on NaN rather than masking it", () => {
    expect(() =>
      rewardForOutcome(true, Number.NaN, 0.5, "learning_gain", 0.5),
    ).toThrow(/NaN/);
  });
});
