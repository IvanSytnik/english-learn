import {
  ItemAttemptedPayloadSchema,
  type ItemAttemptedPayload,
} from "@englishlearn/db/schemas";
import type { FsrsRating } from "../core/fsrs/types";
import type { IrtParams } from "../core/bkt/types";
import type { LearnerEventInsert, LearnerEventRow } from "./db-port";

/**
 * EventStore: the only place LearnerEvent payloads are constructed or parsed.
 *
 * Guarantees:
 *   - every payload written to the DB passed ItemAttemptedPayloadSchema,
 *   - every payload read during replay passes it again (fail-fast on drift).
 */

export type ItemOutcomeFact = {
  userId: string;
  itemId: string;
  conceptId: string;
  correct: boolean;
  timeMs: number | null;
  rating: FsrsRating;
  irt: IrtParams;
  /** Unix ms. */
  occurredAt: bigint;
};

export function buildItemAttemptedEvent(
  fact: ItemOutcomeFact,
): LearnerEventInsert {
  const payload: ItemAttemptedPayload = ItemAttemptedPayloadSchema.parse({
    itemId: fact.itemId,
    conceptId: fact.conceptId,
    correct: fact.correct,
    timeMs: fact.timeMs,
    rating: fact.rating,
    irt: { a: fact.irt.a, b: fact.irt.b },
  });
  return {
    userId: fact.userId,
    type: "ITEM_ATTEMPTED",
    occurredAt: fact.occurredAt,
    payload,
  };
}

export type ParsedItemAttemptedEvent = {
  occurredAt: bigint;
  payload: ItemAttemptedPayload;
};

/** Parse a stored event row back into a typed fact. Throws on invalid payload. */
export function parseEventRow(row: LearnerEventRow): ParsedItemAttemptedEvent {
  if (row.type !== "ITEM_ATTEMPTED") {
    throw new Error(`Unknown LearnerEvent type: ${String(row.type)}`);
  }
  return {
    occurredAt: row.occurredAt,
    payload: ItemAttemptedPayloadSchema.parse(row.payload),
  };
}
