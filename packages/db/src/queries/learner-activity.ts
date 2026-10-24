import type { PrismaClient } from '../generated/client/client';

/**
 * Answer timestamps (Unix ms) for one learner in [fromMs, toMs] — the input
 * to the WeekRhythm read model. Only ITEM_ATTEMPTED: a bootstrap is not
 * practice. Served by the (userId, occurredAt) index.
 *
 * Shape matches @englishlearn/learner-model `RhythmEvent` structurally; this
 * package does not depend on learner-model.
 */
export async function getAttemptEvents(
  db: Pick<PrismaClient, 'learnerEvent'>,
  args: { userId: string; fromMs: number; toMs: number },
): Promise<{ type: 'ITEM_ATTEMPTED'; occurredAt: number }[]> {
  const rows = await db.learnerEvent.findMany({
    where: {
      userId: args.userId,
      type: 'ITEM_ATTEMPTED',
      occurredAt: { gte: BigInt(Math.floor(args.fromMs)), lte: BigInt(Math.floor(args.toMs)) },
    },
    select: { occurredAt: true },
  });
  return rows.map((row) => ({ type: 'ITEM_ATTEMPTED', occurredAt: Number(row.occurredAt) }));
}

/**
 * Whether the learner model was seeded from a diagnostic (a
 * LEARNER_BOOTSTRAPPED event exists). A plain read for page rendering —
 * NOT the bootstrap's strictly-once guard, which runs under the user lock.
 */
export async function hasLearnerBootstrapped(
  db: Pick<PrismaClient, 'learnerEvent'>,
  userId: string,
): Promise<boolean> {
  const row = await db.learnerEvent.findFirst({
    where: { userId, type: 'LEARNER_BOOTSTRAPPED' },
    select: { id: true },
  });
  return row !== null;
}
