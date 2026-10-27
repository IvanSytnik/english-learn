import type { CEFRLevel, ConceptId, EdgeKind } from '../core/graph/types';
import type { LevelGuardConfig } from './level-guard';

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

  /**
   * Level-aware selection (§8 #19 stage 2, "V6b"): the service passes the
   * learner's level to select() only when this is on and an assessed level
   * exists. Off = today's policy, unchanged.
   */
  readonly levelAware: boolean;

  /** V6b and level-guard parameters, calibrated in scripts/sim-policy.ts. */
  readonly levelPolicy: LevelPolicyConfig;
}

/**
 * V6b concept score, for a concept at CEFR rank r and the learner's level θ
 * aiming at r_t = min(θ, highest rank with content):
 *
 *   μ(θ, r)  = clamp(pGuess + (1 − pSlip − pGuess) · σ(k · (θ − r) + c0), 0.1, 0.9)
 *   s        ~ Beta(strength · μ(θ, r) + correct, strength · (1 − μ(θ, r)) + incorrect)
 *   score    = −|s − μ(θ, r_t)| − lambda · |r − r_t|
 *
 * The highest score wins. pGuess / pSlip are the BKT defaults.
 */
export interface LevelPolicyConfig {
  /** Prior strength in pseudo-observations. */
  readonly strength: number;
  /** Logit per CEFR step. */
  readonly k: number;
  /** Logit offset at the learner's own level. */
  readonly c0: number;
  /** Score penalty per CEFR step away from the target level. */
  readonly lambda: number;
  readonly guard: LevelGuardConfig;
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = Object.freeze({
  strategy: 'learning_gain',
  prereqThreshold: 0.7,
  prereqMinObservations: 3,
  calibrationGate: 500,
  hybridGainWeight: 0.5,
  levelAware: true,
  // Decision 2026-10-27 (HANDOFF §7 «Решения 2026-10-27 (Thompson V6b)»).
  levelPolicy: Object.freeze({
    strength: 6,
    k: 1.5,
    c0: 0.75,
    lambda: 0.2,
    guard: Object.freeze({
      streak: 4,
      early: Object.freeze({ n: 7, min: 4 }),
      recover: Object.freeze({ n: 12, min: 0.85 }),
    }),
  }),
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
  /**
   * The learner's working level θ (CEFR rank, after the level guard). Present
   * → the Thompson step scores with V6b and leaves mastered concepts out of
   * the draw; absent or null → today's policy, byte for byte.
   */
  readonly learnerLevel?: { readonly theta: number } | null;
  /**
   * Each concept's CEFR level (Concept.cefrLevel), read with learnerLevel. A
   * concept missing here falls back to its candidate item's level.
   */
  readonly conceptLevels?: Readonly<Record<ConceptId, CEFRLevel>>;
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
