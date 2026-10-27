import {
  type ItemAttemptedPayload,
  ItemAttemptedPayloadSchema,
  type LearnerBootstrappedPayload,
  LearnerBootstrappedPayloadSchema,
} from '@englishlearn/db/schemas';
import type { IrtParams } from '../core/bkt/types';
import type { FsrsRating } from '../core/fsrs/types';
import type { LearnerEventInsert, LearnerEventRow } from './db-port';

/**
 * EventStore: the only place LearnerEvent payloads are constructed or parsed.
 *
 * Guarantees:
 *   - every payload written to the DB passed its per-type Zod schema,
 *   - every payload read during replay passes it again (fail-fast on drift).
 */

export type ItemOutcomeFact = {
  userId: string;
  itemId: string;
  conceptId: string;
  correct: boolean;
  /** "I don't know" — written to the payload only when true. */
  dontKnow?: boolean;
  /** Hint opened before answering — written to the payload only when true. */
  hinted?: boolean;
  timeMs: number | null;
  rating: FsrsRating;
  irt: IrtParams;
  /** Unix ms. */
  occurredAt: bigint;
  /** Client submission key — goes on the envelope, never into the payload. */
  idempotencyKey?: string | null;
};

export function buildItemAttemptedEvent(fact: ItemOutcomeFact): LearnerEventInsert {
  const payload: ItemAttemptedPayload = ItemAttemptedPayloadSchema.parse({
    itemId: fact.itemId,
    conceptId: fact.conceptId,
    correct: fact.correct,
    timeMs: fact.timeMs,
    rating: fact.rating,
    irt: { a: fact.irt.a, b: fact.irt.b },
    ...(fact.dontKnow ? { dontKnow: true } : {}),
    ...(fact.hinted ? { hinted: true } : {}),
  });
  return {
    userId: fact.userId,
    type: 'ITEM_ATTEMPTED',
    occurredAt: fact.occurredAt,
    payload,
    idempotencyKey: fact.idempotencyKey ?? null,
  };
}

/**
 * Build a LEARNER_BOOTSTRAPPED event.
 *
 * The payload is pre-computed by the diagnostic module (buildBootstrapSnapshots)
 * and passed through here for schema validation + envelope construction, so the
 * self-contained-snapshot invariant holds symmetrically with ITEM_ATTEMPTED.
 */
export function buildLearnerBootstrappedEvent(args: {
  userId: string;
  occurredAt: bigint;
  payload: LearnerBootstrappedPayload;
}): LearnerEventInsert {
  const payload = LearnerBootstrappedPayloadSchema.parse(args.payload);
  return {
    userId: args.userId,
    type: 'LEARNER_BOOTSTRAPPED',
    occurredAt: args.occurredAt,
    payload,
  };
}

export type ParsedItemAttemptedEvent = {
  type: 'ITEM_ATTEMPTED';
  occurredAt: bigint;
  payload: ItemAttemptedPayload;
};

export type ParsedLearnerBootstrappedEvent = {
  type: 'LEARNER_BOOTSTRAPPED';
  occurredAt: bigint;
  payload: LearnerBootstrappedPayload;
};

export type ParsedLearnerEvent = ParsedItemAttemptedEvent | ParsedLearnerBootstrappedEvent;

/**
 * Parse a stored event row into a typed, discriminated fact. Throws on invalid
 * payload or unknown type. The discriminated union lets the replay fold switch
 * exhaustively over event types.
 */
export function parseEventRow(row: LearnerEventRow): ParsedLearnerEvent {
  switch (row.type) {
    case 'ITEM_ATTEMPTED':
      return {
        type: 'ITEM_ATTEMPTED',
        occurredAt: row.occurredAt,
        payload: ItemAttemptedPayloadSchema.parse(row.payload),
      };
    case 'LEARNER_BOOTSTRAPPED':
      return {
        type: 'LEARNER_BOOTSTRAPPED',
        occurredAt: row.occurredAt,
        payload: LearnerBootstrappedPayloadSchema.parse(row.payload),
      };
    default:
      throw new Error(`Unknown LearnerEvent type: ${String(row.type)}`);
  }
}
