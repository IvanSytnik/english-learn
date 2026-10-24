import type { DiagnosticAxisValue } from '@englishlearn/db/schemas';
import { CEFR_RANK } from '../core/graph/types';
import { ladderAxisLevel } from './ladder';
import type { AxisEstimate, DiagnosticAnswerFact } from './types';

/**
 * ThetaEstimator: the seam (decision 5.c) between "how we score the diagnostic
 * today" and "how we'll score it once IRT params are calibrated".
 *
 * Today: `ladderEstimator` — the level each axis's ladder settled on (decision
 * 2026-10-24). `accuracyBasedEstimator` (per-axis fraction correct) stays as
 * the simple baseline; next to an adaptive test it hardly separates learners,
 * since adaptivity keeps everyone near 50 % correct.
 *
 * On uncalibrated items (a=1.0, b=0.0 for every item) a full 2PL MLE would
 * mathematically DEGENERATE into logit(accuracy): identical answer, more
 * machinery. An `irt2plEstimator` implementing the same interface can replace
 * these with zero changes to bootstrap.ts, once DiagnosticItem.irtDiscrimination
 * / irtDifficulty carry real calibrated values (≥500 outcomes). Same
 * strategy-switch pattern as bernoulli→learning_gain in the selection policy.
 */

const ALL_AXES: readonly DiagnosticAxisValue[] = ['VOCAB', 'GRAMMAR', 'LISTENING'];

export type ThetaEstimator = {
  /** Frozen into the LEARNER_BOOTSTRAPPED payload for audit. */
  readonly id: 'accuracy' | 'ladder';
  /**
   * Estimate ability per axis from graded answers. Returns an entry for EVERY
   * axis (including axes with zero answers → score 0, answered 0) so callers
   * never have to special-case a missing axis; the sparse-pool guard lives in
   * bootstrap.ts, which inspects `answered`.
   */
  estimate(answers: readonly DiagnosticAnswerFact[]): AxisEstimate[];
};

/**
 * Accuracy-based estimator: score = fraction correct. Pure, deterministic,
 * no item params or levels consumed.
 */
export const accuracyBasedEstimator: ThetaEstimator = {
  id: 'accuracy',
  estimate(answers: readonly DiagnosticAnswerFact[]): AxisEstimate[] {
    const tally = new Map<DiagnosticAxisValue, { correct: number; total: number }>();
    for (const axis of ALL_AXES) tally.set(axis, { correct: 0, total: 0 });

    for (const a of answers) {
      const t = tally.get(a.axis);
      // Defensive: an unknown axis value (schema drift) is ignored rather than
      // crashing the whole bootstrap. Should never happen given the Zod gate.
      if (!t) continue;
      t.total += 1;
      if (a.correct && !a.dontKnow) t.correct += 1;
    }

    return ALL_AXES.map((axis) => {
      const t = tally.get(axis)!;
      return {
        axis,
        score: t.total === 0 ? 0 : t.correct / t.total,
        answered: t.total,
        level: null,
      };
    });
  },
};

/**
 * Ladder estimator: each axis's level is where its ladder settled (mean of
 * the last questions' levels, rounded down — ladder.ts), and the score fed to
 * the formula is that level's rank / 4: A2 0.25, B1 0.5, B2 0.75, C1 1.0.
 * Correctness enters only through the ladder's moves, not as a fraction.
 */
export const ladderEstimator: ThetaEstimator = {
  id: 'ladder',
  estimate(answers: readonly DiagnosticAnswerFact[]): AxisEstimate[] {
    return ALL_AXES.map((axis) => {
      const ofAxis = answers.filter((a) => a.axis === axis).sort((a, b) => a.position - b.position);
      const level = ladderAxisLevel(ofAxis);
      return {
        axis,
        score: level === null ? 0 : Math.min(1, CEFR_RANK[level] / 4),
        answered: ofAxis.length,
        level,
      };
    });
  },
};
