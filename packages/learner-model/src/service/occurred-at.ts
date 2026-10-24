import type { LearnerModelTx } from './db-port';

/**
 * The moment of a new learner event, chosen INSIDE the write transaction,
 * after tx.lockUser(userId).
 *
 * Replay folds events in (occurredAt, id) order; the live path folds them in
 * lock order. The two agree only if occurredAt strictly increases per user in
 * lock order, so:
 *   - from the clock: max(now, last + 1 ms) — two writes in the same
 *     millisecond, or a clock that stepped back, still get distinct,
 *     increasing timestamps;
 *   - explicit (tests, backfills): kept exactly as given — it is a frozen
 *     fact, silently moving it would falsify it — but rejected if it is not
 *     after the user's latest event, because a fact inserted into the past
 *     would replay in a different order than it was folded live.
 */

export type Clock = () => bigint;

export const systemClock: Clock = () => BigInt(Date.now());

export class OccurredAtNotMonotonicError extends Error {
  constructor(
    readonly occurredAt: bigint,
    readonly lastOccurredAt: bigint,
  ) {
    super(
      `occurredAt ${occurredAt} is not after the user's latest event (${lastOccurredAt}); ` +
        'events must be appended in strictly increasing time',
    );
    this.name = 'OccurredAtNotMonotonicError';
  }
}

export async function nextOccurredAt(
  tx: LearnerModelTx,
  userId: string,
  clock: Clock,
  explicit?: bigint,
): Promise<bigint> {
  const last = await tx.lastEventOccurredAt(userId);
  if (explicit !== undefined) {
    if (last !== null && explicit <= last) throw new OccurredAtNotMonotonicError(explicit, last);
    return explicit;
  }
  const now = clock();
  return last !== null && now <= last ? last + 1n : now;
}
