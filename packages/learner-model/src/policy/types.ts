import type { CEFRLevel, ConceptId, EdgeKind } from '../core/graph/types';

/**
 * Selection policy types.
 *
 * Pure data — no Prisma, no I/O. Mirrors the discipline of core/bkt and
 * core/fsrs: the policy operates on plain objects passed in by the service,
 * so it unit-tests at thousands of runs/sec and never touches a DB.
 */

// -----------------------------------------------------------------------------
// Reward strategy
// -----------------------------------------------------------------------------

/**
 * How a completed attempt is turned into bandit reward.
 *
 *  - "bernoulli":     reward = correct ? 1 : 0. Robust, needs no calibration.
 *                     ACTIVE DEFAULT until BKT params are calibrated.
 *  - "learning_gain": reward = pKnown_after − pKnown_before (clamped to [0,1]).
 *                     The pedagogically correct target, but only trustworthy
 *                     once per-concept p_learn/p_slip/p_guess are calibrated
 *                     (needs ≥ calibrationGate outcomes/concept). Gated OFF
 *                     until then — see policyConfigForConcept().
 *  - "hybrid":        blend of both; used during the transition window.
 *
 * We ship all three so flipping strategy is a config change, not a refactor.
 */
export type RewardStrategy = 'bernoulli' | 'learning_gain' | 'hybrid';

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

export interface PolicyConfig {
  /** Active reward strategy (subject to the calibration gate below). */
  readonly strategy: RewardStrategy;

  /**
   * pKnown threshold above which a concept is "mastered" and unlocks its
   * PREREQUISITE dependents. Decision 2026-07-08: 0.7 (standard BKT mastery).
   */
  readonly prereqThreshold: number;

  /**
   * Folded outcomes a parent needs, on top of prereqThreshold, before it
   * unlocks its PREREQUISITE dependents. Decision 2026-10-27 (§8 #19): with
   * the 4PL observation model a cold learner reaches 0.7 after 3 correct
   * answers and a diagnostic prior after 1–2 — the count keeps a lucky guess or
   * two from opening the gate. The BKT maths itself stays undamped.
   */
  readonly prereqMinObservations: number;

  /**
   * Minimum outcomes/concept before "learning_gain" is trusted. Below this,
   * the effective strategy is forced to "bernoulli" regardless of `strategy`.
   * Decision 2026-07-08: 500 (consistent with the BKT calibration gate).
   */
  readonly calibrationGate: number;

  /**
   * Hybrid blend weight on learning_gain in [0,1]. reward =
   * w·gain + (1−w)·bernoulli. Ignored unless the effective strategy is hybrid.
   */
  readonly hybridGainWeight: number;
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = Object.freeze({
  strategy: 'learning_gain',
  prereqThreshold: 0.7,
  prereqMinObservations: 3,
  calibrationGate: 500,
  hybridGainWeight: 0.5,
});

// -----------------------------------------------------------------------------
// Inputs to selection (what the service reads from the DB and hands in)
// -----------------------------------------------------------------------------

/** Per-user BKT snapshot for one concept, as needed by the policy. */
export interface ConceptMasterySnapshot {
  readonly conceptId: ConceptId;
  readonly pKnown: number;
  /** Outcomes folded so far — drives the calibration gate + cold-start. */
  readonly observationCount: number;
  /** Unix ms of last update — anchor for forgetting inside predictCorrect. */
  readonly lastUpdatedAt: number;
  readonly pForgetLambda: number;
}

/** Aggregated attempt tally for one concept, from LearnerEvent history. */
export interface ConceptEventCounts {
  readonly conceptId: ConceptId;
  readonly correct: number;
  readonly incorrect: number;
}

/** A PREREQUISITE edge (from = prerequisite, to = dependent). */
export interface PrereqEdge {
  readonly from: ConceptId;
  readonly to: ConceptId;
  readonly kind: EdgeKind;
}

/** A reviewable item candidate, with its FSRS due moment (if any state). */
export interface DueItem {
  readonly itemId: string;
  readonly conceptId: ConceptId;
  readonly irtDiscrimination: number; // a
  readonly irtDifficulty: number; // b
  readonly cefrLevel: CEFRLevel;
  /**
   * Next-due Unix ms from ItemReviewState, or null if the (user,item) pair has
   * never been reviewed (no ItemReviewState row => a brand-new item).
   */
  readonly dueAt: number | null;
  /** Last review Unix ms from ItemReviewState, or null if never reviewed. */
  readonly lastReviewAt: number | null;
}

/** Everything the pure selector needs — assembled by the service. */
export interface SelectionInput {
  readonly userId: string;
  /** "now" in Unix ms — used for due comparison and forgetting. */
  readonly now: number;
  readonly masteries: readonly ConceptMasterySnapshot[];
  readonly eventCounts: readonly ConceptEventCounts[];
  readonly prereqEdges: readonly PrereqEdge[];
  /** All PUBLISHED items in scope (already status-filtered by the reader). */
  readonly candidates: readonly DueItem[];
  readonly config: PolicyConfig;
  /**
   * The diagnostic's suggested first concept (pickStartConcept), or absent.
   * Served right after REVIEW_DUE while it is unlocked, not started and has a
   * candidate; otherwise ignored. The caller passes it only while no concept
   * is started, so it decides one question.
   */
  readonly startConceptId?: ConceptId | null;
}

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

/** Why the policy picked this concept — for observability / PostHog later. */
export type SelectionReason =
  | 'REVIEW_DUE' // an already-seen item is due; scheduling wins
  | 'NEW_INTRODUCTION' // unlocked, unseen concept introduced via exploration
  | 'EXPLORATION_FLOOR'; // forced pick to prevent starvation

export interface SelectionResult {
  readonly itemId: string;
  readonly conceptId: ConceptId;
  readonly reason: SelectionReason;
  /**
   * True when the concept has no folded outcome yet (a bootstrap prior does
   * not count). NEW_INTRODUCTION alone does NOT imply this — Thompson also
   * picks already-started concepts (HANDOFF gotcha 37c).
   */
  readonly isNewConcept: boolean;
  /**
   * Direct PREREQUISITE parents that opened the gate for a new concept
   * (sorted). Empty for roots and for already-started concepts.
   */
  readonly unlockedBy: readonly ConceptId[];
  /**
   * Most recent review (Unix ms) across the concept's candidate items, or
   * null if none has been reviewed. Concept-level on purpose: the chosen item
   * itself may be unseen while the concept has been practised.
   */
  readonly lastPracticedAt: number | null;
  /** Thompson sample per unlocked concept — debug only, never shown to users. */
  readonly debugScores: Readonly<Record<ConceptId, number>>;
}

/** No selectable candidate (empty pool, or everything locked). */
export type SelectionOutcome =
  | { readonly ok: true; readonly result: SelectionResult }
  | { readonly ok: false; readonly error: 'NO_CANDIDATES' };
