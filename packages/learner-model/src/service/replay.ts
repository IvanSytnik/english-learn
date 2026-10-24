import { bktStateToRow } from '../adapters/concept-mastery';
import { fsrsStateToRow } from '../adapters/item-review-state';
import type { BktState } from '../core/bkt/types';
import type { FsrsCardState } from '../core/fsrs/types';
import type { MasteryStage } from '../mastery/stage';
import { applyItemAttempted, applyLearnerBootstrapped } from './apply';
import type { LearnerModelDb } from './db-port';
import { parseEventRow } from './event-store';

/**
 * Replay: rebuild a user's ConceptMastery + ItemReviewState projections
 * from their LearnerEvent history.
 *
 * Full-rebuild semantics (incremental replay = YAGNI at this scale):
 *   1. delete both projections for the user,
 *   2. fold all events in (occurredAt asc, id asc) order through the SAME
 *      pure applyItemAttempted the live path uses,
 *   3. write the final snapshots.
 *
 * Everything runs in ONE transaction: a crash mid-replay leaves the old
 * snapshots untouched. It takes the same per-user lock as the write paths,
 * so a concurrent recordOutcome waits for the rebuild instead of folding onto
 * half-written projections.
 * At MVP volumes (≤ a few thousand events per user) this is well within
 * Neon's default interactive-transaction limits; revisit when it isn't.
 */

const PAGE_SIZE = 500;

export type ReplayResult = {
  eventsProcessed: number;
  conceptsWritten: number;
  itemsWritten: number;
};

export async function replayUser(db: LearnerModelDb, userId: string): Promise<ReplayResult> {
  return db.runInTx(async (tx) => {
    await tx.lockUser(userId);
    await tx.deleteSnapshots(userId);

    const bktByConcept = new Map<string, BktState>();
    const stageByConcept = new Map<string, MasteryStage>();
    const fsrsByItem = new Map<string, FsrsCardState>();

    let eventsProcessed = 0;
    let cursor: { occurredAt: bigint; id: string } | null = null;

    for (;;) {
      const page = await tx.listEventsAsc(userId, cursor, PAGE_SIZE);
      if (page.length === 0) break;

      for (const row of page) {
        const parsed = parseEventRow(row);

        if (parsed.type === 'ITEM_ATTEMPTED') {
          const { payload, occurredAt } = parsed;
          const next = applyItemAttempted(
            {
              bkt: bktByConcept.get(payload.conceptId) ?? null,
              fsrs: fsrsByItem.get(payload.itemId) ?? null,
              stage: stageByConcept.get(payload.conceptId) ?? null,
            },
            payload,
            occurredAt,
          );
          bktByConcept.set(payload.conceptId, next.bkt);
          stageByConcept.set(payload.conceptId, next.stage);
          fsrsByItem.set(payload.itemId, next.fsrs);
        } else {
          // LEARNER_BOOTSTRAPPED: seeds N concept BKT states directly — no
          // FSRS layer. Same overwrite semantics as the live path (see
          // applyLearnerBootstrapped), so replay stays equivalent.
          const states = applyLearnerBootstrapped(parsed.payload, parsed.occurredAt);
          for (const s of states) {
            bktByConcept.set(s.conceptId, s.bkt);
            stageByConcept.set(s.conceptId, s.stage);
          }
        }

        eventsProcessed += 1;
      }

      const last = page.at(-1);
      if (!last) break; // unreachable (page.length > 0 here), satisfies noUncheckedIndexedAccess
      cursor = { occurredAt: last.occurredAt, id: last.id };
      if (page.length < PAGE_SIZE) break;
    }

    for (const [conceptId, state] of bktByConcept) {
      await tx.upsertConceptMastery(
        userId,
        conceptId,
        bktStateToRow(state, stageByConcept.get(conceptId) ?? 'NOT_STARTED'),
      );
    }
    for (const [itemId, state] of fsrsByItem) {
      await tx.upsertItemReviewState(userId, itemId, fsrsStateToRow(state));
    }

    return {
      eventsProcessed,
      conceptsWritten: bktByConcept.size,
      itemsWritten: fsrsByItem.size,
    };
  });
}
