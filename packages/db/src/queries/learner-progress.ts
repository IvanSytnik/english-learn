import type { PrismaClient } from '../generated/client/client';
import { getConceptTitle, type Locale } from '../schemas';
import { PRACTISABLE_ITEM } from './practisable';

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type ConceptCategory = 'GRAMMAR' | 'VOCAB' | 'LISTENING' | 'PHONETICS' | 'DISCOURSE' | 'PRAGMATICS';
type MasteryStage = 'NOT_STARTED' | 'EMERGING' | 'DEVELOPING' | 'SOLID' | 'HIGH_SOLID';
type FsrsCardStatus = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';

/**
 * Raw facts for the dashboard's concept list, for ONE learner. Read-only.
 *
 * Server-side input only: `pKnown` is here for the prerequisite gate and must
 * never reach the client (BKT numbers are not shown to learners).
 *
 * Shapes match @englishlearn/learner-model `ConceptMasterySnapshot` and
 * `PrereqEdge` structurally; this package does not depend on learner-model.
 */
export type ConceptProgress = {
  /** Concepts with something to practise (`PRACTISABLE_ITEM`), by id. */
  concepts: {
    id: string;
    name: string;
    /** Resolved for the requested locale (title[locale] → title.en → name). */
    title: string;
    cefrLevel: CefrLevel;
    category: ConceptCategory;
    /** Practisable items of the concept — touched or not. */
    itemCount: number;
  }[];
  masteries: {
    conceptId: string;
    pKnown: number;
    observationCount: number;
    displayStage: MasteryStage;
  }[];
  /**
   * Review states of the learner's REVIEWED practisable items
   * (`lastReviewAt` set). Items never answered, and items no longer
   * practisable (archived, unpublished), are left out.
   */
  reviews: {
    conceptId: string;
    stability: number;
    cardStatus: FsrsCardStatus;
    /** Unix ms. */
    dueAt: number;
    /** Unix ms. */
    lastReviewAt: number;
  }[];
  /** Every PREREQUISITE edge — the same set the selection gate reads. */
  prereqEdges: { from: string; to: string; kind: 'PREREQUISITE' }[];
};

export async function getConceptProgress(
  db: Pick<PrismaClient, '$queryRaw' | 'conceptMastery' | 'conceptEdge'>,
  userId: string,
  locale: Locale,
): Promise<ConceptProgress> {
  const [concepts, masteries, reviews, edges] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        name: string;
        title: unknown;
        cefrLevel: CefrLevel;
        category: ConceptCategory;
        itemCount: number;
      }[]
    >`
      SELECT c."id", c."name", c."title",
             c."cefrLevel"::text AS "cefrLevel",
             c."category"::text AS "category",
             COUNT(i."id")::int AS "itemCount"
      FROM "Concept" c
      JOIN "Item" i ON i."conceptId" = c."id" AND ${PRACTISABLE_ITEM}
      GROUP BY c."id"
      ORDER BY c."id"
    `,
    db.conceptMastery.findMany({
      where: { userId },
      select: { conceptId: true, pKnown: true, observationCount: true, displayStage: true },
    }),
    db.$queryRaw<
      {
        conceptId: string;
        stability: number;
        cardStatus: FsrsCardStatus;
        dueAt: bigint;
        lastReviewAt: bigint;
      }[]
    >`
      SELECT i."conceptId", irs."stability",
             irs."cardStatus"::text AS "cardStatus",
             irs."dueAt", irs."lastReviewAt"
      FROM "ItemReviewState" irs
      JOIN "Item" i ON i."id" = irs."itemId"
      WHERE irs."userId" = ${userId}
        AND irs."lastReviewAt" IS NOT NULL
        AND ${PRACTISABLE_ITEM}
      ORDER BY i."conceptId", irs."itemId"
    `,
    db.conceptEdge.findMany({
      where: { kind: 'PREREQUISITE' },
      select: { fromId: true, toId: true },
    }),
  ]);

  return {
    concepts: concepts.map((c) => ({
      id: c.id,
      name: c.name,
      title: getConceptTitle(c, locale),
      cefrLevel: c.cefrLevel,
      category: c.category,
      itemCount: c.itemCount,
    })),
    masteries,
    reviews: reviews.map((r) => ({
      ...r,
      dueAt: Number(r.dueAt),
      lastReviewAt: Number(r.lastReviewAt),
    })),
    prereqEdges: edges.map((e) => ({ from: e.fromId, to: e.toId, kind: 'PREREQUISITE' })),
  };
}
