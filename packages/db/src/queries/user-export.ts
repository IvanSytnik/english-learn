import type { Prisma, PrismaClient } from '../generated/client/client';

/**
 * Everything stored about one user, for the GDPR data export (Art. 15 / 20).
 *
 * Every field is selected by name — never `include` or a bare relation — so
 * `passwordHash` (and any secret column added later) is never read, not just
 * dropped afterwards. Left out on purpose: OAuth `Account` tokens and session
 * tokens (credentials, not data about the learner), `LearnerEvent.idempotencyKey`
 * (transport metadata) and content keys (only item ids are exported).
 */
const USER_EXPORT_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  image: true,
  role: true,
  locale: true,
  signupSource: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      nativeLanguage: true,
      selfReportedLevel: true,
      assessedLevel: true,
      goal: true,
      dailyGoalMin: true,
      streakDays: true,
      lastActiveAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  learnerEvents: {
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, occurredAt: true, payload: true, createdAt: true },
  },
  diagnosticAttempts: {
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      assessedLevel: true,
      answers: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          itemId: true,
          userAnswer: true,
          isCorrect: true,
          dontKnow: true,
          timeMs: true,
          itemLevel: true,
          createdAt: true,
        },
      },
    },
  },
  conceptMasteries: {
    orderBy: { conceptId: 'asc' },
    select: {
      conceptId: true,
      pKnown: true,
      observationCount: true,
      displayStage: true,
      lastUpdatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  itemReviewStates: {
    orderBy: { itemId: 'asc' },
    select: {
      itemId: true,
      stability: true,
      difficulty: true,
      reps: true,
      lapses: true,
      cardStatus: true,
      dueAt: true,
      lastReviewAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  betaFeedbacks: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      text: true,
      url: true,
      itemId: true,
      conceptId: true,
      metadata: true,
      createdAt: true,
    },
  },
  skillLevels: {
    orderBy: { skillTagId: 'asc' },
    select: { skillTagId: true, mastery: true, attempts: true, lastSeenAt: true, updatedAt: true },
  },
  vocabAttempts: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      exerciseId: true,
      selectedIndex: true,
      isCorrect: true,
      timeMs: true,
      createdAt: true,
    },
  },
  grammarAttempts: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { exerciseId: true, userAnswer: true, isCorrect: true, timeMs: true, createdAt: true },
  },
  listeningAttempts: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      exerciseId: true,
      userAnswer: true,
      similarity: true,
      isCorrect: true,
      playCount: true,
      timeMs: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserExportRow = Prisma.UserGetPayload<{ select: typeof USER_EXPORT_SELECT }>;

/** Unix-ms BigInt columns become ISO strings: readable, and `JSON.stringify` cannot take a BigInt. */
const iso = (ms: bigint) => new Date(Number(ms)).toISOString();
const isoOrNull = (ms: bigint | null) => (ms === null ? null : iso(ms));

/**
 * Answers of an attempt still IN_PROGRESS are exported without their verdict
 * and level: the diagnostic never reveals either during the test, and an
 * export must not be a way around that. Both are in the next export once the
 * attempt is finished.
 */
function exportAttempt(attempt: UserExportRow['diagnosticAttempts'][number]) {
  if (attempt.status !== 'IN_PROGRESS') return attempt;
  return {
    ...attempt,
    answers: attempt.answers.map(({ isCorrect: _verdict, itemLevel: _level, ...answer }) => answer),
  };
}

function toPayload(row: UserExportRow) {
  const {
    profile,
    learnerEvents,
    diagnosticAttempts,
    conceptMasteries,
    itemReviewStates,
    betaFeedbacks,
    skillLevels,
    vocabAttempts,
    grammarAttempts,
    listeningAttempts,
    ...user
  } = row;
  return {
    user,
    studentProfile: profile,
    learnerEvents: learnerEvents.map((e) => ({ ...e, occurredAt: iso(e.occurredAt) })),
    diagnosticAttempts: diagnosticAttempts.map(exportAttempt),
    conceptMastery: conceptMasteries.map((m) => ({ ...m, lastUpdatedAt: iso(m.lastUpdatedAt) })),
    itemReviewStates: itemReviewStates.map((s) => ({
      ...s,
      dueAt: iso(s.dueAt),
      lastReviewAt: isoOrNull(s.lastReviewAt),
    })),
    betaFeedbacks,
    legacy: { skillLevels, vocabAttempts, grammarAttempts, listeningAttempts },
  };
}

export type UserExportPayload = ReturnType<typeof toPayload>;

/** The user's data export, or null when there is no such user. JSON-safe (no BigInt). */
export async function getUserExportData(
  db: Pick<PrismaClient, 'user'>,
  userId: string,
): Promise<UserExportPayload | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: USER_EXPORT_SELECT });
  return row ? toPayload(row) : null;
}
