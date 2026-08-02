import type { DiagnosticAxisValue } from '@englishlearn/db/schemas';
import type { AxisEstimate, DiagnosticAnswerFact } from './types';

/**
 * ThetaEstimator: the seam (decision 5.c) between "how we score the diagnostic
 * today" and "how we'll score it once IRT params are calibrated".
 *
 * Today: `accuracyBasedEstimator` — per-axis fraction correct. On uncalibrated
 * items (a=1.0, b=0.0 for every item) a full 2PL MLE would mathematically
 * DEGENERATE into logit(accuracy): identical answer, more machinery. So we
 * skip the machinery and compute accuracy directly.
 *
 * Later: an `irt2plEstimator` implementing the same interface can replace it
 * with zero changes to bootstrap.ts, once DiagnosticItem.irtDiscrimination /
 * irtDifficulty carry real calibrated values (≥500 outcomes). Same
 * strategy-switch pattern as bernoulli→learning_gain in the selection policy.
 */

const ALL_AXES: readonly DiagnosticAxisValue[] = ['VOCAB', 'GRAMMAR', 'LISTENING'];

export type ThetaEstimator = {
  /**
   * Estimate ability per axis from graded answers. Returns an entry for EVERY
   * axis (including axes with zero answers → accuracy 0, answered 0) so callers
   * never have to special-case a missing axis; the sparse-pool guard lives in
   * bootstrap.ts, which inspects `answered`.
   */
  estimate(answers: readonly DiagnosticAnswerFact[]): AxisEstimate[];
};

/**
 * Accuracy-based estimator. Pure, deterministic, no item params consumed.
 */
export const accuracyBasedEstimator: ThetaEstimator = {
  estimate(answers: readonly DiagnosticAnswerFact[]): AxisEstimate[] {
    const tally = new Map<DiagnosticAxisValue, { correct: number; total: number }>();
    for (const axis of ALL_AXES) tally.set(axis, { correct: 0, total: 0 });

    for (const a of answers) {
      const t = tally.get(a.axis);
      // Defensive: an unknown axis value (schema drift) is ignored rather than
      // crashing the whole bootstrap. Should never happen given the Zod gate.
      if (!t) continue;
      t.total += 1;
      if (a.correct) t.correct += 1;
    }

    return ALL_AXES.map((axis) => {
      const t = tally.get(axis)!;
      return {
        axis,
        accuracy: t.total === 0 ? 0 : t.correct / t.total,
        answered: t.total,
      };
    });
  },
};
