import type { ItemAttemptedPayload } from "@englishlearn/db/schemas";
import { initBktState, update } from "../core/bkt/model";
import type { BktState } from "../core/bkt/types";
import { initCardState, reviewCard } from "../core/fsrs/wrapper";
import type { FsrsCardState } from "../core/fsrs/types";

/**
 * The ONE pure fold step shared by the live path (recordOutcome) and replay.
 *
 * Bit-exact replay is guaranteed by construction: both paths call this exact
 * function with the exact same inputs (the frozen event payload + occurredAt),
 * so there is no second implementation to drift.
 *
 * Timestamp discipline: `occurredAt` (bigint ms) is used for BOTH cores —
 * Number(occurredAt) for BKT, occurredAt as-is for FSRS. Never call
 * Date.now() below this line.
 */

export type LearnerStatePair = {
  bkt: BktState;
  fsrs: FsrsCardState;
};

export function applyItemAttempted(
  prev: { bkt: BktState | null; fsrs: FsrsCardState | null },
  payload: ItemAttemptedPayload,
  occurredAt: bigint,
): LearnerStatePair {
  const atMs = Number(occurredAt);

  const bktBefore = prev.bkt ?? initBktState(atMs);
  const bkt = update(bktBefore, {
    correct: payload.correct,
    timestamp: atMs,
    item: { a: payload.irt.a, b: payload.irt.b },
  });

  const fsrsBefore = prev.fsrs ?? initCardState(occurredAt);
  const { state: fsrs } = reviewCard(fsrsBefore, payload.rating, occurredAt);

  return { bkt, fsrs };
}
