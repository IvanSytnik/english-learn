import { clampProb } from './constants';

const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * Exponential forgetting: pKnown' = pKnown · exp(-λ · Δt_hours).
 *
 * - λ in [1/hour]
 * - Δt in milliseconds (will be converted to hours)
 * - Δt ≤ 0 → no decay (idempotent, defensive against clock skew)
 * - λ ≤ 0  → no decay (concept-level opt-out)
 * - Δt → ∞ → pKnown → 0 (clamped to PROB_MIN)
 *
 * We decay only the "known" mass; the unknown mass absorbs it. This is the
 * continuous-time analogue of classic BKT pForget transition.
 */
export function applyForgetting(pKnown: number, lambda: number, deltaMs: number): number {
  if (deltaMs <= 0 || lambda <= 0) return clampProb(pKnown);
  const deltaHours = deltaMs / MS_PER_HOUR;
  const factor = Math.exp(-lambda * deltaHours);
  // Underflow guard — exp(-huge) → 0 in IEEE 754; clampProb pulls back to PROB_MIN.
  const decayed = pKnown * factor;
  return clampProb(decayed);
}
