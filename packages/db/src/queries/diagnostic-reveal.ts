import type { PrismaClient } from '../generated/client/client';

/**
 * Facts for the placement reveal of ONE completed diagnostic attempt.
 *
 * Ownership is part of the query (attemptId AND userId), so a learner can
 * never load someone else's reveal by guessing an id. Returns null for an
 * unknown, foreign, unfinished or level-less attempt.
 *
 * Shape matches @englishlearn/learner-model `RevealAnswerFact` structurally;
 * this package does not depend on learner-model.
 */
export type DiagnosticRevealFacts = {
  assessedLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  /** In position order. */
  answers: {
    position: number;
    axis: 'VOCAB' | 'GRAMMAR' | 'LISTENING';
    /** Level of the question answered (DiagnosticAnswer.itemLevel). */
    itemLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    correct: boolean;
    dontKnow: boolean;
    skillTag: { id: string; slug: string; title: string; category: string } | null;
  }[];
};

export async function getDiagnosticRevealFacts(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  args: { userId: string; attemptId: string },
): Promise<DiagnosticRevealFacts | null> {
  const attempt = await db.diagnosticAttempt.findFirst({
    where: { id: args.attemptId, userId: args.userId, status: 'COMPLETED' },
    select: {
      assessedLevel: true,
      answers: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          itemLevel: true,
          isCorrect: true,
          dontKnow: true,
          item: {
            select: {
              kind: true,
              skillTag: { select: { id: true, slug: true, title: true, category: true } },
            },
          },
        },
      },
    },
  });
  if (!attempt || attempt.assessedLevel === null) return null;

  return {
    assessedLevel: attempt.assessedLevel,
    answers: attempt.answers.map((a) => ({
      position: a.position,
      axis: a.item.kind,
      itemLevel: a.itemLevel,
      correct: a.isCorrect,
      dontKnow: a.dontKnow,
      skillTag: a.item.skillTag,
    })),
  };
}

/**
 * What the reveal needs to suggest a starting concept, for ONE learner:
 * the concepts that have something to practise, the learner's mastery
 * snapshots (read after the bootstrap) and the prerequisite edges. Read-only.
 *
 * "Something to practise" is the selection policy's candidate filter — a
 * PUBLISHED item with a practice question (learner-model `getCandidateItems`).
 * The SQL is duplicated there on purpose (learner-model owns its port); a DB
 * test in learner-model pins both to the same concept set.
 *
 * Shapes match @englishlearn/learner-model `RevealConcept`,
 * `ConceptMasterySnapshot` and `PrereqEdge` structurally.
 */
export type PlacementContext = {
  concepts: { id: string; cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' }[];
  masteries: {
    conceptId: string;
    pKnown: number;
    observationCount: number;
    /** Unix ms. */
    lastUpdatedAt: number;
    pForgetLambda: number;
  }[];
  prereqEdges: { from: string; to: string; kind: 'PREREQUISITE' }[];
};

export async function getPlacementContext(
  db: Pick<PrismaClient, '$queryRaw' | 'conceptMastery' | 'conceptEdge'>,
  userId: string,
): Promise<PlacementContext> {
  const [concepts, masteries, edges] = await Promise.all([
    db.$queryRaw<PlacementContext['concepts']>`
      SELECT c."id", c."cefrLevel"::text AS "cefrLevel"
      FROM "Concept" c
      WHERE EXISTS (
        SELECT 1 FROM "Item" i
        WHERE i."conceptId" = c."id"
          AND i."status" = 'PUBLISHED'
          AND i."content" -> 'practice' IS NOT NULL
      )
      ORDER BY c."id"
    `,
    db.conceptMastery.findMany({
      where: { userId },
      select: {
        conceptId: true,
        pKnown: true,
        observationCount: true,
        lastUpdatedAt: true,
        pForgetLambda: true,
      },
    }),
    db.conceptEdge.findMany({
      where: { kind: 'PREREQUISITE' },
      select: { fromId: true, toId: true },
    }),
  ]);

  return {
    concepts,
    masteries: masteries.map((m) => ({ ...m, lastUpdatedAt: Number(m.lastUpdatedAt) })),
    prereqEdges: edges.map((e) => ({ from: e.fromId, to: e.toId, kind: 'PREREQUISITE' })),
  };
}
