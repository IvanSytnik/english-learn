import type {
  Prisma,
  PrismaClient,
} from "@englishlearn/db/generated/client/index.js";
import type {
  LearnerEventInsert,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
  CandidateItemRow, 
  ConceptCountsRow, 
  MasterySnapshotRow, 
  PrereqEdgeRow,

} from "./db-port";

/**
 * The single Prisma-backed implementation of LearnerModelDb.
 *
 * Uses an INTERACTIVE transaction (callback form) so that reads (current
 * snapshot) and writes (event + new snapshots) happen inside the same DB
 * transaction — two concurrent recordOutcome calls for the same user cannot
 * interleave a stale read between them.
 *
 * NOTE: type-only import of PrismaClient from the generated client — same
 * specifier pattern the seed scripts use from other packages (грабля 26).
 * Requires `prisma generate` to have run, which is already true for every
 * dev/CI flow in this repo.
 */

type PrismaTxClient = Prisma.TransactionClient;

function txOps(tx: PrismaTxClient): LearnerModelTx {
  return {
    async appendEvent(event: LearnerEventInsert): Promise<void> {
      await tx.learnerEvent.create({
        data: {
          userId: event.userId,
          type: event.type,
          occurredAt: event.occurredAt,
          // payload is validated by ItemAttemptedPayloadSchema in
          // event-store.ts before it ever reaches this port.
          payload: event.payload as object,
        },
      });
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
        },
      });
      return row;
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
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        take: limit,
        select: {
          id: true,
          userId: true,
          type: true,
          occurredAt: true,
          payload: true,
        },
      });
      return rows;
    },
  };
}

export function createPrismaLearnerDb(prisma: PrismaClient): LearnerModelDb {
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
    where: { kind: "PREREQUISITE" },
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
      cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
      dueAt: bigint | null;
    }[]
  >`
    SELECT
      i."id" AS "itemId",
      i."conceptId" AS "conceptId",
      i."irtDiscrimination" AS "irtDiscrimination",
      i."irtDifficulty" AS "irtDifficulty",
      i."cefrLevel" AS "cefrLevel",
      irs."dueAt" AS "dueAt"
    FROM "Item" i
    LEFT JOIN "ItemReviewState" irs
      ON irs."itemId" = i."id"
     AND irs."userId" = ${userId}
    WHERE i."status" = 'PUBLISHED'
  `;
},
    runInTx(fn) {
      return prisma.$transaction((tx) => fn(txOps(tx)));
    },
    
  };
}
