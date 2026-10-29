import type { Prisma, PrismaClient } from '@englishlearn/db/generated/client/client.js';
import {
  countNewVocabWordsSince,
  getDailyVocabLimit,
} from '@englishlearn/db/queries/vocab-session';
import {
  type AttemptOutcomeRow,
  type CandidateItemRow,
  type ConceptCountsRow,
  IdempotencyKeyTakenError,
  type LearnerEventInsert,
  type LearnerEventRow,
  type LearnerModelDb,
  type LearnerModelTx,
  type LevelContextRow,
  type MasterySnapshotRow,
  type PrereqEdgeRow,
  type VocabSessionDb,
} from './db-port';

/**
 * The single Prisma-backed implementation of LearnerModelDb.
 *
 * Uses an INTERACTIVE transaction (callback form) so that reads (current
 * snapshot) and writes (event + new snapshots) happen inside the same DB
 * transaction. The transaction alone runs at READ COMMITTED and does NOT stop
 * two writes for the same user from reading the same stale snapshot — the
 * per-user advisory lock (lockUser, first call of every write) does.
 *
 * NOTE: type-only import of PrismaClient from the generated client — same
 * specifier pattern the seed scripts use from other packages (грабля 26).
 * Requires `prisma generate` to have run, which is already true for every
 * dev/CI flow in this repo.
 */

type PrismaTxClient = Prisma.TransactionClient;

/**
 * The user-independent selection reads — the practisable item catalog,
 * PREREQUISITE edges, concept levels — change only when content is seeded,
 * so they are served from memory for STATIC_GRAPH_TTL_MS, per Prisma client
 * and per process (a seed shows up within the TTL). Per-user rows (review
 * state, assessed level) are never cached: a stale due date or level would
 * change what the learner is served.
 */
export const STATIC_GRAPH_TTL_MS = 60_000;

type StaticEntry = { expiresAt: number; value: Promise<unknown> };
let staticGraphCache = new WeakMap<object, Map<string, StaticEntry>>();

/** Drops every cached static read (tests; after a seed in the same process). */
export function clearStaticGraphCache(): void {
  staticGraphCache = new WeakMap();
}

function cachedStatic<T>(owner: object, key: string, load: () => Promise<T>): Promise<T> {
  let entries = staticGraphCache.get(owner);
  if (!entries) {
    entries = new Map();
    staticGraphCache.set(owner, entries);
  }
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = load();
  const entry: StaticEntry = { expiresAt: now + STATIC_GRAPH_TTL_MS, value };
  const bucket = entries;
  bucket.set(key, entry);
  // A failed read is not cached: the next call retries.
  value.catch(() => {
    if (bucket.get(key) === entry) bucket.delete(key);
  });
  return value;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

const EVENT_ROW_SELECT = {
  id: true,
  userId: true,
  type: true,
  occurredAt: true,
  payload: true,
} as const;

function txOps(tx: PrismaTxClient): LearnerModelTx {
  return {
    async lockUser(userId) {
      // $executeRaw, not $queryRaw: the function returns `void`, which
      // $queryRaw cannot deserialize. 64-bit key; a collision between two
      // users only serializes them, it never breaks correctness.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    },

    async appendEvent(event: LearnerEventInsert): Promise<void> {
      const idempotencyKey = event.idempotencyKey ?? null;
      try {
        await tx.learnerEvent.create({
          data: {
            userId: event.userId,
            type: event.type,
            occurredAt: event.occurredAt,
            // payload is validated by ItemAttemptedPayloadSchema in
            // event-store.ts before it ever reaches this port.
            payload: event.payload as object,
            idempotencyKey,
          },
        });
      } catch (e) {
        // The id is a fresh cuid, so with a key the only unique index this
        // insert can hit is (userId, idempotencyKey).
        if (idempotencyKey !== null && isUniqueViolation(e)) {
          throw new IdempotencyKeyTakenError(event.userId, idempotencyKey);
        }
        throw e;
      }
    },

    async findEventByIdempotencyKey(userId, idempotencyKey) {
      return tx.learnerEvent.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        select: EVENT_ROW_SELECT,
      });
    },

    async lastEventOccurredAt(userId) {
      const row = await tx.learnerEvent.findFirst({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      });
      return row?.occurredAt ?? null;
    },

    async hasEventOfType(userId, type) {
      const row = await tx.learnerEvent.findFirst({
        where: { userId, type },
        select: { id: true },
      });
      return row !== null;
    },

    async getConceptMastery(userId, conceptId) {
      const row = await tx.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId } },
        select: {
          pKnown: true,
          pLearn: true,
          pSlip: true,
          pGuess: true,
          pForgetLambda: true,
          lastUpdatedAt: true,
          observationCount: true,
          displayStage: true,
        },
      });
      return row;
    },

    async getConceptMasteries(userId, conceptIds) {
      return tx.conceptMastery.findMany({
        where: { userId, conceptId: { in: [...conceptIds] } },
        select: {
          conceptId: true,
          pKnown: true,
          pLearn: true,
          pSlip: true,
          pGuess: true,
          pForgetLambda: true,
          lastUpdatedAt: true,
          observationCount: true,
          displayStage: true,
        },
      });
    },

    async upsertConceptMastery(userId, conceptId, write) {
      await tx.conceptMastery.upsert({
        where: { userId_conceptId: { userId, conceptId } },
        create: { userId, conceptId, ...write },
        update: write,
      });
    },

    async getItemReviewState(userId, itemId) {
      const row = await tx.itemReviewState.findUnique({
        where: { userId_itemId: { userId, itemId } },
        select: {
          stability: true,
          difficulty: true,
          reps: true,
          lapses: true,
          learningSteps: true,
          cardStatus: true,
          dueAt: true,
          lastReviewAt: true,
        },
      });
      return row;
    },

    async upsertItemReviewState(userId, itemId, write) {
      await tx.itemReviewState.upsert({
        where: { userId_itemId: { userId, itemId } },
        create: { userId, itemId, ...write },
        update: write,
      });
    },

    async deleteSnapshots(userId) {
      await tx.conceptMastery.deleteMany({ where: { userId } });
      await tx.itemReviewState.deleteMany({ where: { userId } });
    },

    async listEventsAsc(userId, cursor, limit): Promise<LearnerEventRow[]> {
      const rows = await tx.learnerEvent.findMany({
        where: cursor
          ? {
              userId,
              OR: [
                { occurredAt: { gt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { gt: cursor.id } },
              ],
            }
          : { userId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: EVENT_ROW_SELECT,
      });
      return rows;
    },
  };
}

/**
 * `txTimeoutMs` overrides Prisma's interactive-transaction timeout (5 s) —
 * for scripts/replay-all.ts, whose per-user rebuild upserts every row one by
 * one. The app keeps the default: a live write that slow is a bug.
 */
export function createPrismaLearnerDb(
  prisma: PrismaClient,
  options: { txTimeoutMs?: number } = {},
): LearnerModelDb {
  return {
    async getItemForOutcome(itemId, pool) {
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: {
          conceptId: true,
          irtDiscrimination: true,
          irtDifficulty: true,
          status: true,
          hasPractice: true,
          kind: true,
          lexemeId: true,
          lexeme: { select: { status: true } },
        },
      });
      // Only an item the pool's selection could have served is recorded: a
      // draft or archived item never reaches the event log, and neither does
      // an item of the other pool (V3 for grammar; Axiom 6 both ways).
      if (!item || item.status !== 'PUBLISHED') return null;
      const recordable =
        pool === 'grammar'
          ? item.hasPractice
          : item.kind === 'VOCAB_WORD' &&
            item.lexemeId !== null &&
            !item.hasPractice &&
            item.lexeme?.status === 'PUBLISHED';
      if (!recordable) return null;
      return {
        conceptId: item.conceptId,
        irtDiscrimination: item.irtDiscrimination,
        irtDifficulty: item.irtDifficulty,
      };
    },
    async getMasterySnapshots(userId): Promise<MasterySnapshotRow[]> {
      return prisma.conceptMastery.findMany({
        where: { userId },
        select: {
          conceptId: true,
          pKnown: true,
          observationCount: true,
          lastUpdatedAt: true,
          pForgetLambda: true,
        },
      });
    },

    async getPrereqEdges(): Promise<PrereqEdgeRow[]> {
      return cachedStatic(prisma, 'prereqEdges', async () => {
        const rows = await prisma.conceptEdge.findMany({
          where: { kind: 'PREREQUISITE' },
          select: { fromId: true, toId: true, kind: true },
        });

        return rows.map((r) => ({
          from: r.fromId,
          to: r.toId,
          kind: r.kind,
        }));
      });
    },

    async getConceptEventCounts(userId): Promise<ConceptCountsRow[]> {
      const rows = await prisma.$queryRaw<
        { conceptId: string; correct: bigint; incorrect: bigint }[]
      >`
    SELECT
      payload->>'conceptId' AS "conceptId",
      COUNT(*) FILTER (WHERE payload->>'correct' = 'true') AS "correct",
      COUNT(*) FILTER (WHERE payload->>'correct' = 'false') AS "incorrect"
    FROM "LearnerEvent"
    WHERE "userId" = ${userId}
      AND "type" = 'ITEM_ATTEMPTED'
    GROUP BY payload->>'conceptId'
  `;

      return rows.map((r) => ({
        conceptId: r.conceptId,
        correct: Number(r.correct),
        incorrect: Number(r.incorrect),
      }));
    },

    async getCandidateItems(userId): Promise<CandidateItemRow[]> {
      // The catalog filters on the hasPractice column (index on status,
      // hasPractice) and never reads content; the user's review state is a
      // separate, always-fresh read merged in memory (LEFT JOIN semantics).
      const [catalog, reviews] = await Promise.all([
        cachedStatic(prisma, 'candidateCatalog', () =>
          prisma.item.findMany({
            where: { status: 'PUBLISHED', hasPractice: true },
            select: {
              id: true,
              conceptId: true,
              irtDiscrimination: true,
              irtDifficulty: true,
              cefrLevel: true,
            },
          }),
        ),
        prisma.itemReviewState.findMany({
          where: { userId },
          select: { itemId: true, dueAt: true, lastReviewAt: true },
        }),
      ]);
      const reviewByItem = new Map(reviews.map((r) => [r.itemId, r]));
      return catalog.map((item) => {
        const review = reviewByItem.get(item.id);
        return {
          itemId: item.id,
          conceptId: item.conceptId,
          irtDiscrimination: item.irtDiscrimination,
          irtDifficulty: item.irtDifficulty,
          cefrLevel: item.cefrLevel,
          dueAt: review?.dueAt ?? null,
          lastReviewAt: review?.lastReviewAt ?? null,
        };
      });
    },
    async getLevelContext(userId): Promise<LevelContextRow> {
      const [profile, concepts] = await Promise.all([
        prisma.studentProfile.findUnique({ where: { userId }, select: { assessedLevel: true } }),
        cachedStatic(prisma, 'conceptLevels', () =>
          prisma.concept.findMany({ select: { id: true, cefrLevel: true } }),
        ),
      ]);
      return { level: profile?.assessedLevel ?? null, concepts };
    },
    async getAttemptOutcomes(userId): Promise<AttemptOutcomeRow[]> {
      return prisma.$queryRaw<AttemptOutcomeRow[]>`
    SELECT
      payload->>'conceptId' AS "conceptId",
      (payload->>'correct')::boolean AS "correct",
      COALESCE((payload->>'hinted')::boolean, false) AS "hinted"
    FROM "LearnerEvent"
    WHERE "userId" = ${userId}
      AND "type" = 'ITEM_ATTEMPTED'
      AND "occurredAt" > COALESCE(
        (SELECT MAX("occurredAt") FROM "LearnerEvent"
          WHERE "userId" = ${userId} AND "type" = 'LEARNER_BOOTSTRAPPED'),
        -1
      )
    ORDER BY "occurredAt" ASC, "id" ASC
  `;
    },
    runInTx(fn) {
      return prisma.$transaction(
        (tx) => fn(txOps(tx)),
        options.txTimeoutMs === undefined ? undefined : { timeout: options.txTimeoutMs },
      );
    },
  };
}

/**
 * The Prisma-backed VocabSessionDb. The published vocabulary is static data
 * (cached like the grammar catalogue); the learner's review states are a
 * fresh read merged in memory.
 */
export function createPrismaVocabSessionDb(prisma: PrismaClient): VocabSessionDb {
  return {
    async getVocabCandidates(userId) {
      const [catalogue, reviews] = await Promise.all([
        cachedStatic(prisma, 'vocabCatalogue', () =>
          prisma.item.findMany({
            where: {
              kind: 'VOCAB_WORD',
              status: 'PUBLISHED',
              hasPractice: false,
              lexemeId: { not: null },
              lexeme: { status: 'PUBLISHED' },
            },
            select: { id: true, conceptId: true, cefrLevel: true },
          }),
        ),
        prisma.itemReviewState.findMany({
          where: { userId, item: { lexemeId: { not: null } } },
          select: {
            itemId: true,
            dueAt: true,
            cardStatus: true,
            stability: true,
            lastReviewAt: true,
          },
        }),
      ]);
      const reviewByItem = new Map(reviews.map(({ itemId, ...review }) => [itemId, review]));
      return catalogue.map((item) => ({
        itemId: item.id,
        conceptId: item.conceptId,
        cefrLevel: item.cefrLevel,
        review: reviewByItem.get(item.id) ?? null,
      }));
    },
    countNewVocabSince(userId, sinceMs) {
      return countNewVocabWordsSince(prisma, { userId, sinceMs });
    },
    async getVocabProfile(userId) {
      const [dailyLimit, profile] = await Promise.all([
        getDailyVocabLimit(prisma, userId),
        prisma.studentProfile.findUnique({ where: { userId }, select: { assessedLevel: true } }),
      ]);
      return { dailyLimit, assessedLevel: profile?.assessedLevel ?? null };
    },
  };
}
