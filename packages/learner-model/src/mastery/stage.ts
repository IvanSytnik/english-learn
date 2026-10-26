/**
 * Mastery Ladder (design decision 2026-10-19, HANDOFF §7).
 *
 * Two layers, deliberately split:
 *
 *  - MasteryStage — the BKT-only, hysteresis-guarded stage STORED on
 *    ConceptMastery.displayStage. Written only by the event fold from the
 *    stored (un-decayed) pKnown, so it is replay-reproducible and never drops
 *    just because time passed. Forgetting is surfaced via `isFading`, not here.
 *
 *  - EffectiveStage — what the learner sees. Computed at read time: HIGH_SOLID
 *    becomes SECURE only when the concept's items are also durably remembered
 *    (median FSRS stability > 21 d), otherwise it shows as SOLID. Keeping the
 *    FSRS part out of the fold keeps the fold single-concept + single-item.
 *
 * Pure: no I/O, no Date.now().
 */

export const MASTERY_STAGES = [
  'NOT_STARTED',
  'EMERGING',
  'DEVELOPING',
  'SOLID',
  'HIGH_SOLID',
] as const;
/** Mirror of the Prisma MasteryStage enum — keep in sync. */
export type MasteryStage = (typeof MASTERY_STAGES)[number];

export type EffectiveStage = 'NOT_STARTED' | 'EMERGING' | 'DEVELOPING' | 'SOLID' | 'SECURE';

/**
 * Upgrade thresholds on pKnown. SOLID's 0.70 is the prereq gate's pKnown
 * threshold (DEFAULT_POLICY_CONFIG.prereqThreshold) — the ladder and the
 * curriculum must agree on what "Solid" means. The gate also wants
 * prereqMinObservations outcomes (§8 #19), so a concept that turns Solid on
 * its first or second answer keeps its dependents locked until the third.
 */
export const STAGE_THRESHOLDS = Object.freeze({
  DEVELOPING: 0.4,
  SOLID: 0.7,
  HIGH_SOLID: 0.9,
});

/** A stage only drops once pKnown falls this far below its entry threshold. */
export const DOWNGRADE_HYSTERESIS = 0.05;

/** Median FSRS stability (days) above which HIGH_SOLID is shown as SECURE. */
export const SECURE_MIN_MEDIAN_STABILITY_DAYS = 21;

const RANK: Readonly<Record<MasteryStage, number>> = Object.freeze({
  NOT_STARTED: 0,
  EMERGING: 1,
  DEVELOPING: 2,
  SOLID: 3,
  HIGH_SOLID: 4,
});

/** Highest observed stage pKnown reaches with every threshold shifted by `offset`. */
function stageAt(pKnown: number, offset: number): MasteryStage {
  if (pKnown >= STAGE_THRESHOLDS.HIGH_SOLID + offset) return 'HIGH_SOLID';
  if (pKnown >= STAGE_THRESHOLDS.SOLID + offset) return 'SOLID';
  if (pKnown >= STAGE_THRESHOLDS.DEVELOPING + offset) return 'DEVELOPING';
  return 'EMERGING';
}

/**
 * Next stored stage after an observed outcome.
 *
 * Upgrades are immediate (and may skip levels); downgrades use thresholds
 * lowered by DOWNGRADE_HYSTERESIS and never go below what those lowered
 * thresholds allow — e.g. SOLID drops to DEVELOPING only below 0.65, and
 * DEVELOPING to EMERGING only below 0.35. An observed concept never returns
 * to NOT_STARTED.
 *
 * @param prev   stored stage before this outcome (NOT_STARTED for a new or
 *               bootstrap-only concept)
 * @param pKnown stored (un-decayed) pKnown AFTER the outcome
 */
export function nextDisplayStage(prev: MasteryStage, pKnown: number): MasteryStage {
  const raised = stageAt(pKnown, 0);
  if (RANK[raised] >= RANK[prev]) return raised;
  const lowered = stageAt(pKnown, -DOWNGRADE_HYSTERESIS);
  return RANK[lowered] < RANK[prev] ? lowered : prev;
}

/** Median of a non-empty list; null for an empty one. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Learner-facing stage for one concept.
 *
 * The 0.90 hysteresis already lives in the stored stage (HIGH_SOLID is only
 * left below 0.85), so this needs no pKnown — passing a raw pKnown here would
 * re-introduce a stateless threshold and lose the hysteresis.
 *
 * @param itemStabilities FSRS stability (days) of the concept's REVIEWED items
 *                        (never-reviewed items carry no memory and are excluded
 *                        by the caller)
 */
export function computeEffectiveStage(
  displayStage: MasteryStage,
  itemStabilities: readonly number[],
): EffectiveStage {
  if (displayStage !== 'HIGH_SOLID') return displayStage;
  const m = median(itemStabilities);
  return m !== null && m > SECURE_MIN_MEDIAN_STABILITY_DAYS ? 'SECURE' : 'SOLID';
}

/**
 * "Due for review" overlay: true if any reviewed item of the concept is due.
 * An overlay only — it never changes the stage.
 *
 * @param itemDueAts Unix ms dueAt of the concept's reviewed items
 */
export function isFading(itemDueAts: readonly number[], now: number): boolean {
  return itemDueAts.some((dueAt) => dueAt <= now);
}
