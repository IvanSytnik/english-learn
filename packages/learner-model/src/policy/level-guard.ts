/**
 * Level guard (§8 #19 stage 2b, decision 2026-10-27): the learner's working
 * level for selection, starting at the diagnostic's placement and corrected
 * by practice when the placement looks too high.
 *
 * A pure function of the placement and the ordered practice outcomes — no
 * stored state, so a replay of the same events yields the same level. Only
 * answers on concepts at the current target level count:
 *
 *   DOWN (G1)  `streak` misses in a row at the target level
 *   DOWN (G2)  of the first `early.n` answers at a newly set target level,
 *              fewer than `early.min` right
 *   UP   (R)   while below the placement: the last `recover.n` answers at the
 *              lowered level are right at a rate ≥ `recover.min`
 *
 * Every move resets the streak and both windows. The target is the level
 * capped at the highest one with content (a C1 learner aims at B2 today), so
 * a step down from above the content lands one below that top level. Never
 * below the lowest level with content.
 *
 * Parameters were calibrated in scripts/sim-policy.ts (HANDOFF §7
 * «Решения 2026-10-27 (Thompson V6b)»).
 */

export interface LevelGuardConfig {
  /** G1: misses in a row at the target level that step it down. */
  readonly streak: number;
  /** G2: the first `n` answers at a newly set level need at least `min` right. */
  readonly early: { readonly n: number; readonly min: number };
  /** R: while below the placement, `n` answers at a rate ≥ `min` step back up. */
  readonly recover: { readonly n: number; readonly min: number };
}

/** One practice outcome, oldest first. */
export interface LevelGuardOutcome {
  /** CEFR rank of the concept answered (core/graph CEFR_RANK). */
  readonly rank: number;
  readonly correct: boolean;
  /**
   * The hint was opened. A correct hinted answer is not evidence of the level
   * (same rule as BKT, §8 #11) and is skipped; a hinted miss counts.
   */
  readonly hinted?: boolean;
}

export interface LevelGuardInput {
  /** CEFR rank of the diagnostic placement (StudentProfile.assessedLevel). */
  readonly placedRank: number;
  readonly outcomes: readonly LevelGuardOutcome[];
  /** Lowest and highest CEFR rank among practisable concepts. */
  readonly minRank: number;
  readonly maxRank: number;
  readonly config: LevelGuardConfig;
}

export interface LevelGuardResult {
  /** The working level θ (CEFR rank) to select with; may sit above maxRank. */
  readonly theta: number;
  /** θ capped at maxRank: the level selection aims at. */
  readonly targetRank: number;
  readonly downs: number;
  readonly ups: number;
}

export function levelGuard(input: LevelGuardInput): LevelGuardResult {
  const { placedRank, minRank, maxRank, config } = input;
  const targetOf = (t: number) => Math.min(t, maxRank);

  let theta = placedRank;
  let streak = 0;
  let sinceSet: boolean[] = [];
  let recent: boolean[] = [];
  let downs = 0;
  let ups = 0;

  const moveTo = (t: number) => {
    theta = t;
    streak = 0;
    sinceSet = [];
    recent = [];
  };

  for (const o of input.outcomes) {
    if (o.correct && o.hinted === true) continue;
    const target = targetOf(theta);
    if (o.rank !== target) continue;

    streak = o.correct ? 0 : streak + 1;
    sinceSet.push(o.correct);
    recent.push(o.correct);
    if (recent.length > config.recover.n) recent.shift();

    const earlyMiss = sinceSet.length === config.early.n && countRight(sinceSet) < config.early.min;
    if (target > minRank && (streak >= config.streak || earlyMiss)) {
      moveTo(target - 1);
      downs++;
      continue;
    }

    if (
      theta < placedRank &&
      recent.length >= config.recover.n &&
      countRight(recent) / config.recover.n >= config.recover.min
    ) {
      moveTo(theta + 1);
      ups++;
    }
  }

  return { theta, targetRank: targetOf(theta), downs, ups };
}

function countRight(answers: readonly boolean[]): number {
  let n = 0;
  for (const a of answers) if (a) n++;
  return n;
}
