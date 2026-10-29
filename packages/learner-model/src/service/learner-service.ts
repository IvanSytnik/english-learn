import type { PracticeModeValue } from '@englishlearn/db/schemas';
import { bktStateToRow, rowToBktState } from '../adapters/concept-mastery';
import { fsrsStateToRow, rowToFsrsState } from '../adapters/item-review-state';
import type { FsrsCardStatus, FsrsRating } from '../core/fsrs/types';
import type { MasteryStage } from '../mastery/stage';
import { applyItemAttempted } from './apply';
import {
  IdempotencyKeyTakenError,
  type LearnerModelDb,
  type LearnerModelTx,
  type OutcomePool,
} from './db-port';
import { buildItemAttemptedEvent, parseEventRow } from './event-store';
import { type Clock, nextOccurredAt, systemClock } from './occurred-at';

/**
 * LearnerService: the single write path into the learner model.
 *
 * recordOutcome is the ONLY way a learning outcome enters the system.
 * Server actions call this; nothing else writes LearnerEvent, ConceptMastery
 * or ItemReviewState (except the replay job, which rebuilds the latter two).
 */

export type RecordOutcomeInput = {
  userId: string;
  itemId: string;
  /** Response time in ms, if the client measured it. */
  timeMs?: number;
  /**
   * Override the outcome moment (Unix ms). Tests and backfills only —
   * production callers omit it and get max(now, latest event + 1 ms). Must be
   * after the user's latest event (OccurredAtNotMonotonicError otherwise).
   */
  occurredAtMs?: bigint;
  /**
   * The hint (`H`) was opened at least once before answering (§8 #11). A
   * correct hinted answer is rated HARD and leaves pKnown unchanged; with an
   * incorrect answer or don't-know it changes nothing but the frozen flag.
   */
  hinted?: boolean;
  /**
   * Client key of this submission, one per question shown. A retry with the
   * same key records nothing and returns the original outcome
   * (`duplicate: true`); the same key with another item is
   * IDEMPOTENCY_CONFLICT. null / absent = no deduplication.
   */
  idempotencyKey?: string | null;
} & (
  | { correct: boolean; dontKnow?: false }
  /**
   * "I don't know" (key `0`). Recorded as an incorrect answer — for BKT it is
   * evidence of not knowing without guess noise, for FSRS a lapse (AGAIN).
   * The flag is frozen into the payload; the fold does not branch on it.
   */
  | { dontKnow: true; correct?: false }
);

/**
 * A vocabulary answer (B2.5). Recorded through the vocab pool only: a grammar
 * item is ITEM_NOT_FOUND here, a vocabulary item is ITEM_NOT_FOUND in
 * recordOutcome.
 */
export type RecordVocabOutcomeInput = RecordOutcomeInput & {
  /** Payload mode of the ladder step that was served (vocab/ladder.ts). */
  mode: PracticeModeValue;
  /**
   * The answer is a "Know -> prove" check on a new word. A correct, unhinted
   * proof is rated EASY and frozen with `proof: true` — FSRS then schedules
   * the word as known (S ≈ 8.3, +8 d) and it does not count toward the daily
   * new-word limit. A failed proof is an ordinary attempt without the flag.
   * Only a recall answer can prove (the payload schema enforces it).
   */
  proof?: boolean;
};

/**
 * What the post-answer UI needs, taken from the same fold that was persisted:
 * a stage crossing (pKnownBefore → pKnownAfter) or the next review moment.
 * BKT numbers are mapped to semantic stages by the caller, never shown raw.
 */
export type RecordOutcomeResult =
  | ({ ok: true; duplicate: false } & RecordedOutcome)
  /**
   * The key was already recorded: nothing was written. The numbers describe
   * the state now (pKnownBefore = pKnownAfter, stageBefore = stageAfter — no
   * crossing to announce twice); `original` is the answer as first recorded,
   * which the retry's own answer must not override.
   */
  | ({ ok: true; duplicate: true; original: OriginalAnswer } & RecordedOutcome)
  /**
   * ITEM_NOT_FOUND: no such item, or one that is not practisable (not
   * PUBLISHED, or no practice question — V3). Nothing is written.
   */
  | { ok: false; error: 'ITEM_NOT_FOUND' | 'IDEMPOTENCY_CONFLICT' };

export type OriginalAnswer = { correct: boolean; dontKnow: boolean; hinted: boolean };

type RecordedOutcome = {
  occurredAt: bigint;
  rating: FsrsRating;
  conceptId: string;
  /** Stored pKnown just before the outcome (no time decay — §8 #10). */
  pKnownBefore: number;
  /** Stored (un-decayed) pKnown after the outcome. */
  pKnownAfter: number;
  /** Next FSRS due moment for this item, Unix ms. */
  nextDueAt: bigint;
  /** FSRS interval in days; 0 = intra-day learning step ("Back soon"). */
  scheduledDays: number;
  cardStatus: FsrsCardStatus;
  /** Stored ConceptMastery.displayStage before / after this outcome. */
  stageBefore: MasteryStage;
  stageAfter: MasteryStage;
};

/**
 * Outcome -> FSRS rating mapping (decision 2026-07-04, option a; HARD for a
 * hinted answer — §8 #11).
 *
 * Deliberately coarse: correct = GOOD, correct after the hint = HARD,
 * incorrect = AGAIN (hint or not). Response-time-based
 * refinement (EASY/HARD) is deferred until real timeMs distributions exist —
 * thresholds picked without data would be guesses. The chosen rating is
 * FROZEN into the event payload, so changing this mapping later does not
 * corrupt replay of historical events.
 */
export function outcomeToRating(correct: boolean, hinted = false): FsrsRating {
  if (!correct) return 'AGAIN';
  return hinted ? 'HARD' : 'GOOD';
}

export type LearnerServiceDeps = {
  /** Source of "now" for outcomes without an explicit occurredAtMs. */
  clock?: Clock;
};

const DAY_MS = 86_400_000n;

/**
 * The outcome already recorded under `idempotencyKey`, or null if the key is
 * new. Runs under the user lock, so the projections it reads are exactly what
 * the original write (and anything after it) left.
 */
async function recordedOutcome(
  tx: LearnerModelTx,
  input: RecordOutcomeInput,
  idempotencyKey: string,
): Promise<RecordOutcomeResult | null> {
  const row = await tx.findEventByIdempotencyKey(input.userId, idempotencyKey);
  if (!row) return null;
  const event = parseEventRow(row);
  if (event.type !== 'ITEM_ATTEMPTED' || event.payload.itemId !== input.itemId) {
    return { ok: false, error: 'IDEMPOTENCY_CONFLICT' };
  }

  const { payload } = event;
  const [masteryRow, reviewRow] = await Promise.all([
    tx.getConceptMastery(input.userId, payload.conceptId),
    tx.getItemReviewState(input.userId, payload.itemId),
  ]);
  if (!masteryRow || !reviewRow) {
    // Every recorded ITEM_ATTEMPTED has both projections (same tx, and replay
    // rebuilds them under the same lock) — missing ones mean corruption.
    throw new Error(`projections missing for learner event ${row.id}`);
  }
  return {
    ok: true,
    duplicate: true,
    original: {
      correct: payload.correct,
      dontKnow: payload.dontKnow === true,
      hinted: payload.hinted === true,
    },
    occurredAt: event.occurredAt,
    rating: payload.rating,
    conceptId: payload.conceptId,
    pKnownBefore: masteryRow.pKnown,
    pKnownAfter: masteryRow.pKnown,
    nextDueAt: reviewRow.dueAt,
    // FSRS puts dueAt exactly scheduledDays after the review (intra-day
    // learning steps: minutes, so 0) — the interval of the latest review.
    scheduledDays:
      reviewRow.lastReviewAt === null
        ? 0
        : Number((reviewRow.dueAt - reviewRow.lastReviewAt) / DAY_MS),
    cardStatus: reviewRow.cardStatus,
    stageBefore: masteryRow.displayStage,
    stageAfter: masteryRow.displayStage,
  };
}

export function createLearnerService(db: LearnerModelDb, deps: LearnerServiceDeps = {}) {
  const clock = deps.clock ?? systemClock;

  /**
   * The one write flow behind both pools: gate, then one transaction under
   * the user lock — idempotency, monotonic occurredAt, event, shared fold,
   * projections.
   */
  async function record(
    pool: OutcomePool,
    input: RecordOutcomeInput,
    vocab?: { mode: PracticeModeValue; proof: boolean },
  ): Promise<RecordOutcomeResult> {
    const item = await db.getItemForOutcome(input.itemId, pool);
    if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };

    const correct = input.dontKnow ? false : input.correct;
    const hinted = input.hinted === true;
    const proof = vocab?.proof === true && correct && !hinted;
    const rating = proof ? 'EASY' : outcomeToRating(correct, hinted);
    const idempotencyKey = input.idempotencyKey ?? null;

    try {
      return await db.runInTx(async (tx): Promise<RecordOutcomeResult> => {
        // 0. Serialize with every other write for this user. A retried
        //    submission stops here, before anything is written; then take
        //    the single "now" for this outcome — event, BKT and FSRS all
        //    use it.
        await tx.lockUser(input.userId);
        if (idempotencyKey !== null) {
          const recorded = await recordedOutcome(tx, input, idempotencyKey);
          if (recorded) return recorded;
        }
        const occurredAt = await nextOccurredAt(tx, input.userId, clock, input.occurredAtMs);

        const event = buildItemAttemptedEvent({
          userId: input.userId,
          itemId: input.itemId,
          conceptId: item.conceptId,
          correct,
          dontKnow: input.dontKnow === true,
          hinted,
          ...(vocab ? { mode: vocab.mode } : {}),
          proof,
          timeMs: input.timeMs ?? null,
          rating,
          irt: { a: item.irtDiscrimination, b: item.irtDifficulty },
          occurredAt,
          idempotencyKey,
        });

        // 1. The fact, first — projections are derived from it.
        await tx.appendEvent(event);

        // 2. Read current snapshots INSIDE the tx, under the user lock (no
        //    concurrent write can change them before step 4).
        const [masteryRow, reviewRow] = await Promise.all([
          tx.getConceptMastery(input.userId, item.conceptId),
          tx.getItemReviewState(input.userId, input.itemId),
        ]);

        // 3. One shared pure fold — identical to what replay runs.
        const folded = applyItemAttempted(
          {
            bkt: masteryRow ? rowToBktState(masteryRow) : null,
            fsrs: reviewRow ? rowToFsrsState(reviewRow) : null,
            stage: masteryRow?.displayStage ?? null,
          },
          // buildItemAttemptedEvent returned a schema-parsed payload.
          event.payload as Parameters<typeof applyItemAttempted>[1],
          occurredAt,
        );

        // 4. Persist projections.
        await tx.upsertConceptMastery(
          input.userId,
          item.conceptId,
          bktStateToRow(folded.bkt, folded.stage),
        );
        await tx.upsertItemReviewState(input.userId, input.itemId, fsrsStateToRow(folded.fsrs));

        return {
          ok: true,
          duplicate: false,
          occurredAt,
          rating,
          conceptId: item.conceptId,
          pKnownBefore: folded.pKnownBefore,
          pKnownAfter: folded.bkt.pKnown,
          nextDueAt: folded.fsrs.dueAt,
          scheduledDays: folded.scheduledDays,
          cardStatus: folded.fsrs.cardStatus,
          stageBefore: masteryRow?.displayStage ?? 'NOT_STARTED',
          stageAfter: folded.stage,
        };
      });
    } catch (e) {
      // The unique index caught a second write of this key that the user
      // lock did not serialize (a writer outside it). The aborted tx is
      // gone and the winner is committed — answer from it in a fresh one.
      if (!(e instanceof IdempotencyKeyTakenError) || idempotencyKey === null) throw e;
      const recorded = await db.runInTx(async (tx) => {
        await tx.lockUser(input.userId);
        return recordedOutcome(tx, input, idempotencyKey);
      });
      if (!recorded) throw e;
      return recorded;
    }
  }

  return {
    /** A grammar answer: practisable items only (V3). */
    recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {
      return record('grammar', input);
    },
    /** A vocabulary answer: published lexeme-backed items only (B2.5). */
    recordVocabOutcome(input: RecordVocabOutcomeInput): Promise<RecordOutcomeResult> {
      const { mode, proof, ...outcome } = input;
      return record('vocab', outcome as RecordOutcomeInput, { mode, proof: proof === true });
    },
  };
}

export type LearnerService = ReturnType<typeof createLearnerService>;
