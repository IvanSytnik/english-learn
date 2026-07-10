import { bktStateToRow } from '../adapters/concept-mastery';
import { fsrsStateToRow } from '../adapters/item-review-state';
import type { BktState } from '../core/bkt/types';
import type { FsrsCardState } from '../core/fsrs/types';
import { applyItemAttempted } from './apply';
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
 * snapshots untouched; a concurrent recordOutcome serializes against it.
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
    await tx.deleteSnapshots(userId);

    const bktByConcept = new Map<string, BktState>();
    const fsrsByItem = new Map<string, FsrsCardState>();

    let eventsProcessed = 0;
    let cursor: { occurredAt: bigint; id: string } | null = null;

    for (;;) {
      const page = await tx.listEventsAsc(userId, cursor, PAGE_SIZE);
      if (page.length === 0) break;

      for (const row of page) {
        const { payload, occurredAt } = parseEventRow(row);
        const next = applyItemAttempted(
          {
            bkt: bktByConcept.get(payload.conceptId) ?? null,
            fsrs: fsrsByItem.get(payload.itemId) ?? null,
          },
          payload,
          occurredAt,
        );
        bktByConcept.set(payload.conceptId, next.bkt);
        fsrsByItem.set(payload.itemId, next.fsrs);
        eventsProcessed += 1;
      }

      const last = page.at(-1);
      if (!last) break; // unreachable (page.length > 0 here), satisfies noUncheckedIndexedAccess
      cursor = { occurredAt: last.occurredAt, id: last.id };
      if (page.length < PAGE_SIZE) break;
    }

    for (const [conceptId, state] of bktByConcept) {
      await tx.upsertConceptMastery(userId, conceptId, bktStateToRow(state));
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
