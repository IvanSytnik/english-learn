import { bktStateToRow, rowToBktState } from '../adapters/concept-mastery';
import { fsrsStateToRow, rowToFsrsState } from '../adapters/item-review-state';
import type { FsrsRating } from '../core/fsrs/types';
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

export type RecordOutcomeResult =
  | { ok: true; occurredAt: bigint; rating: FsrsRating }
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

      await db.runInTx(async (tx) => {
        // 1. The fact, first — projections are derived from it.
        await tx.appendEvent(event);

        // 2. Read current snapshots INSIDE the tx (no stale-read race).
        const [masteryRow, reviewRow] = await Promise.all([
          tx.getConceptMastery(input.userId, item.conceptId),
          tx.getItemReviewState(input.userId, input.itemId),
        ]);

        // 3. One shared pure fold — identical to what replay runs.
        const next = applyItemAttempted(
          {
            bkt: masteryRow ? rowToBktState(masteryRow) : null,
            fsrs: reviewRow ? rowToFsrsState(reviewRow) : null,
          },
          // buildItemAttemptedEvent returned a schema-parsed payload.
          event.payload as Parameters<typeof applyItemAttempted>[1],
          occurredAt,
        );

        // 4. Persist projections.
        await tx.upsertConceptMastery(input.userId, item.conceptId, bktStateToRow(next.bkt));
        await tx.upsertItemReviewState(input.userId, input.itemId, fsrsStateToRow(next.fsrs));
      });

      return { ok: true, occurredAt, rating };
    },
  };
}

export type LearnerService = ReturnType<typeof createLearnerService>;
