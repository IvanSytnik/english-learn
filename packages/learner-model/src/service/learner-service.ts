import { bktStateToRow, rowToBktState } from '../adapters/concept-mastery';
import { fsrsStateToRow, rowToFsrsState } from '../adapters/item-review-state';
import type { FsrsCardStatus, FsrsRating } from '../core/fsrs/types';
import { applyItemAttempted } from './apply';
import type { LearnerModelDb } from './db-port';
import { buildItemAttemptedEvent } from './event-store';

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
  correct: boolean;
  /** Response time in ms, if the client measured it. */
  timeMs?: number;
  /**
   * Override the outcome moment (Unix ms). Tests and backfills only —
   * production callers omit it and get Date.now().
   */
  occurredAtMs?: bigint;
};

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
      /** pKnown just before the outcome, forgetting applied up to occurredAt. */
      pKnownBefore: number;
      /** Stored (un-decayed) pKnown after the outcome. */
      pKnownAfter: number;
      /** Next FSRS due moment for this item, Unix ms. */
      nextDueAt: bigint;
      /** FSRS interval in days; 0 = intra-day learning step ("Back soon"). */
      scheduledDays: number;
      cardStatus: FsrsCardStatus;
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

export function createLearnerService(db: LearnerModelDb) {
  return {
    async recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {
      // The single "now" for this outcome — event, BKT and FSRS all use it.
      const occurredAt = input.occurredAtMs ?? BigInt(Date.now());

      const item = await db.getItemForOutcome(input.itemId);
      if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };

      const rating = outcomeToRating(input.correct);
      const event = buildItemAttemptedEvent({
        userId: input.userId,
        itemId: input.itemId,
        conceptId: item.conceptId,
        correct: input.correct,
        timeMs: input.timeMs ?? null,
        rating,
        irt: { a: item.irtDiscrimination, b: item.irtDifficulty },
        occurredAt,
      });

      const next = await db.runInTx(async (tx) => {
        // 1. The fact, first — projections are derived from it.
        await tx.appendEvent(event);

        // 2. Read current snapshots INSIDE the tx (no stale-read race).
        const [masteryRow, reviewRow] = await Promise.all([
          tx.getConceptMastery(input.userId, item.conceptId),
          tx.getItemReviewState(input.userId, input.itemId),
        ]);

        // 3. One shared pure fold — identical to what replay runs.
        const folded = applyItemAttempted(
          {
            bkt: masteryRow ? rowToBktState(masteryRow) : null,
            fsrs: reviewRow ? rowToFsrsState(reviewRow) : null,
          },
          // buildItemAttemptedEvent returned a schema-parsed payload.
          event.payload as Parameters<typeof applyItemAttempted>[1],
          occurredAt,
        );

        // 4. Persist projections.
        await tx.upsertConceptMastery(input.userId, item.conceptId, bktStateToRow(folded.bkt));
        await tx.upsertItemReviewState(input.userId, input.itemId, fsrsStateToRow(folded.fsrs));

        return folded;
      });

      return {
        ok: true,
        occurredAt,
        rating,
        conceptId: item.conceptId,
        pKnownBefore: next.pKnownBefore,
        pKnownAfter: next.bkt.pKnown,
        nextDueAt: next.fsrs.dueAt,
        scheduledDays: next.scheduledDays,
        cardStatus: next.fsrs.cardStatus,
      };
    },
  };
}

export type LearnerService = ReturnType<typeof createLearnerService>;
