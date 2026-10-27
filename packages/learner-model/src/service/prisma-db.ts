import type { Prisma, PrismaClient } from '@englishlearn/db/generated/client/client.js';
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
    async getItemForOutcome(itemId) {
      return prisma.item.findUnique({
        where: { id: itemId },
        select: {
          conceptId: true,
          irtDiscrimination: true,
          irtDifficulty: true,
        },
      });
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
      const rows = await prisma.conceptEdge.findMany({
        where: { kind: 'PREREQUISITE' },
        select: { fromId: true, toId: true, kind: true },
      });

      return rows.map((r) => ({
        from: r.fromId,
        to: r.toId,
        kind: r.kind,
      }));
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
      return prisma.$queryRaw<
        {
          itemId: string;
          conceptId: string;
          irtDiscrimination: number;
          irtDifficulty: number;
          cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
          dueAt: bigint | null;
          lastReviewAt: bigint | null;
        }[]
      >`
    SELECT
      i."id" AS "itemId",
      i."conceptId" AS "conceptId",
      i."irtDiscrimination" AS "irtDiscrimination",
      i."irtDifficulty" AS "irtDifficulty",
      i."cefrLevel" AS "cefrLevel",
      irs."dueAt" AS "dueAt",
      irs."lastReviewAt" AS "lastReviewAt"
    FROM "Item" i
    LEFT JOIN "ItemReviewState" irs
      ON irs."itemId" = i."id"
     AND irs."userId" = ${userId}
    WHERE i."status" = 'PUBLISHED'
      AND i."content" -> 'practice' IS NOT NULL
  `;
    },
    async getLevelContext(userId): Promise<LevelContextRow> {
      const [profile, concepts] = await Promise.all([
        prisma.studentProfile.findUnique({ where: { userId }, select: { assessedLevel: true } }),
        prisma.concept.findMany({ select: { id: true, cefrLevel: true } }),
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
