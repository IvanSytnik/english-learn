import type { ConceptMasteryRow } from '../../adapters/concept-mastery';
import type { ItemReviewStateRow } from '../../adapters/item-review-state';
import type {
  ItemForOutcome,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
  PrereqEdgeRow,
} from '../db-port';

/**
 * The one in-memory LearnerModelDb for service tests. No Prisma, no
 * atomicity (tests are sequential), but it holds the invariants the real
 * write paths rely on, so a service that breaks them fails here:
 *   - appendEvent rejects an occurredAt that is not after the user's latest
 *     event (what nextOccurredAt guarantees under the user lock);
 *   - listEventsAsc orders by (occurredAt, id) with the same cursor as Prisma.
 *
 * lockUser is a no-op, but every tx method call is logged per transaction
 * (`transactions`), so tests can assert the lock comes first.
 */

export type MemoryDbOptions = {
  items?: Record<string, ItemForOutcome>;
  edges?: PrereqEdgeRow[];
};

export function createMemoryDb(options: MemoryDbOptions = {}) {
  const items = options.items ?? {};
  const edges = options.edges ?? [];
  const events: LearnerEventRow[] = [];
  const masteries = new Map<string, ConceptMasteryRow>(); // `${userId}:${conceptId}`
  const reviews = new Map<string, ItemReviewStateRow>(); // `${userId}:${itemId}`
  /** Method names called on the tx, one array per runInTx. */
  const transactions: string[][] = [];
  let nextId = 0;

  const userEvents = (userId: string) => events.filter((e) => e.userId === userId);

  const tx: LearnerModelTx = {
    async lockUser() {},
    async appendEvent(event) {
      const last = await tx.lastEventOccurredAt(event.userId);
      if (last !== null && event.occurredAt <= last) {
        throw new Error(`memory-db: occurredAt ${event.occurredAt} is not after ${last}`);
      }
      nextId += 1;
      events.push({
        id: `evt_${String(nextId).padStart(6, '0')}`,
        userId: event.userId,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    },
    async lastEventOccurredAt(userId) {
      let last: bigint | null = null;
      for (const e of userEvents(userId))
        if (last === null || e.occurredAt > last) last = e.occurredAt;
      return last;
    },
    async hasEventOfType(userId, type) {
      return userEvents(userId).some((e) => e.type === type);
    },
    async getConceptMastery(userId, conceptId) {
      const row = masteries.get(`${userId}:${conceptId}`);
      return row ? { ...row } : null;
    },
    async getConceptMasteries(userId, conceptIds) {
      return conceptIds.flatMap((conceptId) => {
        const row = masteries.get(`${userId}:${conceptId}`);
        return row ? [{ conceptId, ...row }] : [];
      });
    },
    async upsertConceptMastery(userId, conceptId, write) {
      masteries.set(`${userId}:${conceptId}`, { ...write });
    },
    async getItemReviewState(userId, itemId) {
      const row = reviews.get(`${userId}:${itemId}`);
      return row ? { ...row } : null;
    },
    async upsertItemReviewState(userId, itemId, write) {
      reviews.set(`${userId}:${itemId}`, { ...write });
    },
    async deleteSnapshots(userId) {
      for (const key of [...masteries.keys()]) {
        if (key.startsWith(`${userId}:`)) masteries.delete(key);
      }
      for (const key of [...reviews.keys()]) {
        if (key.startsWith(`${userId}:`)) reviews.delete(key);
      }
    },
    async listEventsAsc(userId, cursor, limit) {
      const before = (
        a: { occurredAt: bigint; id: string },
        b: { occurredAt: bigint; id: string },
      ) => a.occurredAt < b.occurredAt || (a.occurredAt === b.occurredAt && a.id < b.id);
      const sorted = userEvents(userId).sort((a, b) => (before(a, b) ? -1 : 1));
      const afterCursor = cursor ? sorted.filter((e) => before(cursor, e)) : sorted;
      return afterCursor.slice(0, limit);
    },
  };

  /** A tx view that logs each call into the current transaction's entry. */
  function loggingTx(log: string[]): LearnerModelTx {
    return Object.fromEntries(
      Object.entries(tx).map(([name, fn]) => [
        name,
        (...args: unknown[]) => {
          log.push(name);
          return (fn as (...a: unknown[]) => unknown)(...args);
        },
      ]),
    ) as LearnerModelTx;
  }

  const db: LearnerModelDb = {
    async getItemForOutcome(itemId) {
      return items[itemId] ?? null;
    },
    async runInTx(fn) {
      const log: string[] = [];
      transactions.push(log);
      return fn(loggingTx(log));
    },
    async getMasterySnapshots(userId) {
      return [...masteries.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([key, row]) => ({
          conceptId: key.slice(userId.length + 1),
          pKnown: row.pKnown,
          observationCount: row.observationCount,
          lastUpdatedAt: row.lastUpdatedAt,
          pForgetLambda: row.pForgetLambda,
        }));
    },
    async getPrereqEdges() {
      return edges;
    },
    async getConceptEventCounts(userId) {
      const tally = new Map<string, { correct: number; incorrect: number }>();
      for (const e of userEvents(userId)) {
        if (e.type !== 'ITEM_ATTEMPTED') continue;
        const p = e.payload as { conceptId: string; correct: boolean };
        const t = tally.get(p.conceptId) ?? { correct: 0, incorrect: 0 };
        if (p.correct) t.correct += 1;
        else t.incorrect += 1;
        tally.set(p.conceptId, t);
      }
      return [...tally.entries()].map(([conceptId, t]) => ({ conceptId, ...t }));
    },
    async getCandidateItems(userId) {
      return Object.entries(items).map(([itemId, item]) => ({
        itemId,
        conceptId: item.conceptId,
        irtDiscrimination: item.irtDiscrimination,
        irtDifficulty: item.irtDifficulty,
        cefrLevel: 'A2' as const,
        dueAt: reviews.get(`${userId}:${itemId}`)?.dueAt ?? null,
        lastReviewAt: reviews.get(`${userId}:${itemId}`)?.lastReviewAt ?? null,
      }));
    },
  };

  return { db, events, masteries, reviews, transactions };
}
