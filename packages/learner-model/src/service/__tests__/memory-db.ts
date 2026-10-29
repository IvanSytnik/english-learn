import type { ConceptMasteryRow } from '../../adapters/concept-mastery';
import type { ItemReviewStateRow } from '../../adapters/item-review-state';
import {
  IdempotencyKeyTakenError,
  type ItemForOutcome,
  type LearnerEventRow,
  type LearnerModelDb,
  type LearnerModelTx,
  type LevelContextRow,
  type OutcomePool,
  type PrereqEdgeRow,
} from '../db-port';

/**
 * The one in-memory LearnerModelDb for service tests. No Prisma, no
 * atomicity (tests are sequential), but it holds the invariants the real
 * write paths rely on, so a service that breaks them fails here:
 *   - appendEvent rejects an occurredAt that is not after the user's latest
 *     event (what nextOccurredAt guarantees under the user lock);
 *   - listEventsAsc orders by (occurredAt, id) with the same cursor as Prisma;
 *   - appendEvent rejects a (userId, idempotencyKey) pair already taken, like
 *     the unique index (IdempotencyKeyTakenError, what prisma-db throws).
 *
 * lockUser is a no-op, but every tx method call is logged per transaction
 * (`transactions`), so tests can assert the lock comes first.
 */

/** An item and the pool it belongs to (default grammar). Vocab items are never candidates. */
export type MemoryItem = ItemForOutcome & { pool?: OutcomePool };

export type MemoryDbOptions = {
  items?: Record<string, MemoryItem>;
  edges?: PrereqEdgeRow[];
  /** getLevelContext: assessed level per user (absent = null) and concept levels. */
  assessedLevels?: Record<string, LevelContextRow['level']>;
  concepts?: LevelContextRow['concepts'];
};

export function createMemoryDb(options: MemoryDbOptions = {}) {
  const items = options.items ?? {};
  const edges = options.edges ?? [];
  const events: LearnerEventRow[] = [];
  const masteries = new Map<string, ConceptMasteryRow>(); // `${userId}:${conceptId}`
  const reviews = new Map<string, ItemReviewStateRow>(); // `${userId}:${itemId}`
  /** Method names called on the tx, one array per runInTx. */
  const transactions: string[][] = [];
  /** `${userId}:${idempotencyKey}` -> event id (the unique index). */
  const idempotencyKeys = new Map<string, string>();
  let nextId = 0;

  const userEvents = (userId: string) => events.filter((e) => e.userId === userId);

  const tx: LearnerModelTx = {
    async lockUser() {},
    async appendEvent(event) {
      const last = await tx.lastEventOccurredAt(event.userId);
      if (last !== null && event.occurredAt <= last) {
        throw new Error(`memory-db: occurredAt ${event.occurredAt} is not after ${last}`);
      }
      const key = event.idempotencyKey ?? null;
      if (key !== null && idempotencyKeys.has(`${event.userId}:${key}`)) {
        throw new IdempotencyKeyTakenError(event.userId, key);
      }
      nextId += 1;
      const id = `evt_${String(nextId).padStart(6, '0')}`;
      if (key !== null) idempotencyKeys.set(`${event.userId}:${key}`, id);
      events.push({
        id,
        userId: event.userId,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    },
    async findEventByIdempotencyKey(userId, idempotencyKey) {
      const id = idempotencyKeys.get(`${userId}:${idempotencyKey}`);
      const row = events.find((e) => e.id === id);
      return row ? { ...row } : null;
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
    async getItemForOutcome(itemId, pool) {
      const item = items[itemId];
      if (!item || (item.pool ?? 'grammar') !== pool) return null;
      const { pool: _, ...forOutcome } = item;
      return forOutcome;
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
    async getLevelContext(userId) {
      return {
        level: options.assessedLevels?.[userId] ?? null,
        concepts: options.concepts ?? [],
      };
    },
    async getAttemptOutcomes(userId) {
      // Same order and anchor as prisma-db: after the latest bootstrap, (occurredAt, id).
      const ordered = [...userEvents(userId)].sort((a, b) =>
        a.occurredAt !== b.occurredAt
          ? a.occurredAt < b.occurredAt
            ? -1
            : 1
          : a.id < b.id
            ? -1
            : 1,
      );
      const lastBootstrap = ordered.findLastIndex((e) => e.type === 'LEARNER_BOOTSTRAPPED');
      return ordered
        .slice(lastBootstrap + 1)
        .filter((e) => e.type === 'ITEM_ATTEMPTED')
        .map((e) => {
          const p = e.payload as { conceptId: string; correct: boolean; hinted?: boolean };
          return { conceptId: p.conceptId, correct: p.correct, hinted: p.hinted === true };
        });
    },
    async getCandidateItems(userId) {
      const grammar = Object.entries(items).filter(([, item]) => item.pool !== 'vocab');
      return grammar.map(([itemId, item]) => ({
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

  return { db, tx, events, masteries, reviews, transactions, idempotencyKeys };
}
