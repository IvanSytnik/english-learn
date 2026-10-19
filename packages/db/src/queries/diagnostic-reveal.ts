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
  levelTrajectory: ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')[];
  answers: {
    axis: 'VOCAB' | 'GRAMMAR' | 'LISTENING';
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
      levelTrajectory: true,
      answers: {
        orderBy: { position: 'asc' },
        select: {
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
    levelTrajectory: attempt.levelTrajectory,
    answers: attempt.answers.map((a) => ({
      axis: a.item.kind,
      correct: a.isCorrect,
      dontKnow: a.dontKnow,
      skillTag: a.item.skillTag,
    })),
  };
}
