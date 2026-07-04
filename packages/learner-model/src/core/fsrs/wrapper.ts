import {
  type Card,
  type Grade,
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";
import type {
  FsrsCardState,
  FsrsCardStatus,
  FsrsRating,
  FsrsReviewResult,
} from "./types";

/**
 * The ONLY module allowed to import ts-fsrs.
 *
 * Pure functions over immutable FsrsCardState. Timestamps are bigint Unix ms
 * at the boundary; ts-fsrs Dates live only inside this file.
 *
 * Scheduler parameters are the ts-fsrs defaults (FSRS-6 weights,
 * request_retention 0.9). Personalized parameters (per-user optimization
 * from review logs) are a post-MVP concern; the seams for it are the
 * `params` argument below.
 */

const DEFAULT_PARAMS = generatorParameters({
  // Fuzz adds ±5% jitter to intervals to avoid review pile-ups. We keep it
  // OFF for now: deterministic output keeps tests and event replay (Day 7)
  // bit-stable. Revisit when real users create real pile-ups.
  enable_fuzz: false,
});

const scheduler = fsrs(DEFAULT_PARAMS);

// ─── Enum mappings (single place where numeric ts-fsrs codes appear) ────────

const RATING_TO_TSFSRS: Record<FsrsRating, Grade> = {
  AGAIN: Rating.Again,
  HARD: Rating.Hard,
  GOOD: Rating.Good,
  EASY: Rating.Easy,
};

const STATE_TO_STATUS: Record<State, FsrsCardStatus> = {
  [State.New]: "NEW",
  [State.Learning]: "LEARNING",
  [State.Review]: "REVIEW",
  [State.Relearning]: "RELEARNING",
};

const STATUS_TO_STATE: Record<FsrsCardStatus, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
};

// ─── bigint ms ↔ Date conversion ─────────────────────────────────────────────

function msToDate(ms: bigint): Date {
  return new Date(Number(ms));
}

function dateToMs(d: Date): bigint {
  return BigInt(d.getTime());
}

// ─── FsrsCardState ↔ ts-fsrs Card conversion ─────────────────────────────────

function stateToCard(state: FsrsCardState): Card {
  return {
    due: msToDate(state.dueAt),
    stability: state.stability,
    difficulty: state.difficulty,
    // elapsed/scheduled are recomputed by the scheduler on each review;
    // persisting them adds no information, so we don't.
    elapsed_days: 0,
    scheduled_days: 0,
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: state.learningSteps,
    state: STATUS_TO_STATE[state.cardStatus],
    last_review:
      state.lastReviewAt === null ? undefined : msToDate(state.lastReviewAt),
  };
}

function cardToState(card: Card): FsrsCardState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    cardStatus: STATE_TO_STATUS[card.state],
    dueAt: dateToMs(card.due),
    lastReviewAt: card.last_review ? dateToMs(card.last_review) : null,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fresh card for an item the user has never reviewed.
 * dueAt = nowMs (immediately available).
 */
export function initCardState(nowMs: bigint): FsrsCardState {
  return cardToState(createEmptyCard(msToDate(nowMs)));
}

/**
 * Apply one review. Pure: returns a new state, never mutates the input.
 *
 * @param state  Current card state (from initCardState or a previous review).
 * @param rating Learner's answer quality.
 * @param nowMs  Review moment, Unix ms.
 */
export function reviewCard(
  state: FsrsCardState,
  rating: FsrsRating,
  nowMs: bigint,
): FsrsReviewResult {
  const { card, log } = scheduler.next(
    stateToCard(state),
    msToDate(nowMs),
    RATING_TO_TSFSRS[rating],
  );
  return {
    state: cardToState(card),
    scheduledDays: card.scheduled_days,
    elapsedDays: log.elapsed_days,
  };
}

/**
 * Probability the item is still remembered at `nowMs` (0..1).
 * Returns null for NEW cards (no memory to decay yet).
 */
export function retrievability(
  state: FsrsCardState,
  nowMs: bigint,
): number | null {
  if (state.cardStatus === "NEW") return null;
  return scheduler.get_retrievability(stateToCard(state), msToDate(nowMs), false);
}

/** True if the card is due for review at `nowMs`. NEW cards are always due. */
export function isDue(state: FsrsCardState, nowMs: bigint): boolean {
  return state.dueAt <= nowMs;
}
