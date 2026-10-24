import { bktStateToRow, rowToBktState } from '../adapters/concept-mastery';
import { fsrsStateToRow, rowToFsrsState } from '../adapters/item-review-state';
import type { FsrsCardStatus, FsrsRating } from '../core/fsrs/types';
import type { MasteryStage } from '../mastery/stage';
import { applyItemAttempted } from './apply';
import type { LearnerModelDb } from './db-port';
import { buildItemAttemptedEvent } from './event-store';
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
 * What the post-answer UI needs, taken from the same fold that was persisted:
 * a stage crossing (pKnownBefore → pKnownAfter) or the next review moment.
 * BKT numbers are mapped to semantic stages by the caller, never shown raw.
 */
export type RecordOutcomeResult =
  | {
      ok: true;
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
    }
  | { ok: false; error: 'ITEM_NOT_FOUND' };

/**
 * Binary outcome -> FSRS rating mapping (decision 2026-07-04, option a).
 *
 * Deliberately coarse: correct = GOOD, incorrect = AGAIN. Response-time-based
 * refinement (EASY/HARD) is deferred until real timeMs distributions exist —
 * thresholds picked without data would be guesses. The chosen rating is
 * FROZEN into the event payload, so changing this mapping later does not
 * corrupt replay of historical events.
 */
export function outcomeToRating(correct: boolean): FsrsRating {
  return correct ? 'GOOD' : 'AGAIN';
}

export type LearnerServiceDeps = {
  /** Source of "now" for outcomes without an explicit occurredAtMs. */
  clock?: Clock;
};

export function createLearnerService(db: LearnerModelDb, deps: LearnerServiceDeps = {}) {
  const clock = deps.clock ?? systemClock;

  return {
    async recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {
      const item = await db.getItemForOutcome(input.itemId);
      if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };

      const correct = input.dontKnow ? false : input.correct;
      const rating = outcomeToRating(correct);

      const next = await db.runInTx(async (tx) => {
        // 0. Serialize with every other write for this user, then take the
        //    single "now" for this outcome — event, BKT and FSRS all use it.
        await tx.lockUser(input.userId);
        const occurredAt = await nextOccurredAt(tx, input.userId, clock, input.occurredAtMs);

        const event = buildItemAttemptedEvent({
          userId: input.userId,
          itemId: input.itemId,
          conceptId: item.conceptId,
          correct,
          dontKnow: input.dontKnow === true,
          timeMs: input.timeMs ?? null,
          rating,
          irt: { a: item.irtDiscrimination, b: item.irtDifficulty },
          occurredAt,
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
          ...folded,
          occurredAt,
          stageBefore: masteryRow?.displayStage ?? ('NOT_STARTED' as const),
        };
      });

      return {
        ok: true,
        occurredAt: next.occurredAt,
        rating,
        conceptId: item.conceptId,
        pKnownBefore: next.pKnownBefore,
        pKnownAfter: next.bkt.pKnown,
        nextDueAt: next.fsrs.dueAt,
        scheduledDays: next.scheduledDays,
        cardStatus: next.fsrs.cardStatus,
        stageBefore: next.stageBefore,
        stageAfter: next.stage,
      };
    },
  };
}

export type LearnerService = ReturnType<typeof createLearnerService>;
