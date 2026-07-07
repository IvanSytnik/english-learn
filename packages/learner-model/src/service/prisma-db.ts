import type {
  Prisma,
  PrismaClient,
} from "@englishlearn/db/generated/client/index.js";
import type {
  LearnerEventInsert,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
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

    runInTx(fn) {
      return prisma.$transaction((tx) => fn(txOps(tx)));
    },
  };
}
