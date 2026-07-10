/**
 * Seedable pseudo-random number generation for the selection policy.
 *
 * WHY THIS EXISTS (same class of bug as FSRS fuzz — грабля):
 * Thompson Sampling draws from Beta posteriors. If those draws use Math.random,
 * selection becomes non-deterministic, which:
 *   - breaks property-based tests (no reproducible failure),
 *   - breaks any future "replay the session" / eval-harness scenario,
 *   - makes debugging impossible ("why did it pick THAT item?").
 *
 * So ALL stochasticity in the policy flows through an injected Rng. Production
 * seeds it from a per-request integer; tests seed it with a fixed value. The
 * pure select() never calls Math.random directly.
 *
 * mulberry32: tiny, fast, well-distributed 32-bit PRNG. We are not doing
 * cryptography — we need reproducibility + decent uniformity. Beta sampling is
 * built on top via Marsaglia–Tsang gamma (two gammas -> beta), stable for all
 * α,β > 0.
 */

/** A deterministic source of uniform [0,1) draws. */
export interface Rng {
  /** Next uniform in [0, 1). */
  next(): number;
}

/**
 * mulberry32 — seedable 32-bit generator.
 * Same seed => same infinite sequence, on every platform (pure integer math).
 */
export function makeRng(seed: number): Rng {
  // Coerce to uint32 so callers can pass any integer (incl. a truncated Date.now()).
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia–Tsang (2000).
 *
 * Valid for shape > 0. For shape < 1 we use the boost trick
 * Gamma(shape) = Gamma(shape+1) · U^(1/shape).
 *
 * All randomness comes from `rng`, so the whole thing is deterministic under a
 * fixed seed.
 */
function sampleGamma(rng: Rng, shape: number): number {
  if (shape <= 0 || !Number.isFinite(shape)) {
    throw new RangeError(`Gamma shape must be finite and > 0, got ${shape}`);
  }

  if (shape < 1) {
    const u = clampOpenUnit(rng.next());
    return sampleGamma(rng, shape + 1) * u ** (1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // Rejection loop. Expected iterations < 1.1 for shape >= 1, so this
  // terminates quickly; the explicit guard is paranoia against a degenerate RNG.
  for (let guard = 0; guard < 10_000; guard++) {
    const x = standardNormal(rng);
    const v0 = 1 + c * x;
    if (v0 <= 0) continue;
    const v = v0 * v0 * v0;
    const u = clampOpenUnit(rng.next());
    // Squeeze + full acceptance tests.
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  // Practically unreachable; fall back to the mean so we never hang a request.
  return d;
}

/** Box–Muller standard normal from two uniforms of `rng`. */
function standardNormal(rng: Rng): number {
  const u1 = clampOpenUnit(rng.next());
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Avoid log(0) / division blowups by nudging off the open-interval edges. */
function clampOpenUnit(u: number): number {
  const EPS = 1e-12;
  if (u < EPS) return EPS;
  if (u > 1 - EPS) return 1 - EPS;
  return u;
}

/**
 * Sample from Beta(α, β), α,β > 0.
 *
 * X ~ Gamma(α,1), Y ~ Gamma(β,1)  =>  X/(X+Y) ~ Beta(α,β).
 * Returns a value in (0,1). Deterministic under a fixed `rng`.
 */
export function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  const sum = x + y;
  if (sum <= 0) return 0.5; // degenerate guard; both gammas ~0
  return x / sum;
}
