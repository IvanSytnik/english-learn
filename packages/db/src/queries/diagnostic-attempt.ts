import type { PrismaClient } from '../generated/client/client';

/**
 * Diagnostic attempt lifecycle: start or resume, read the state the ladder
 * replays, append an answer, complete.
 *
 * The client is a parameter (as in diagnostic-reveal.ts), so the queries run
 * against any database — the integration tests use a throwaway Postgres.
 *
 * Integrity lives in the database, not here (migration
 * 20261024120000_diagnostic_attempt_integrity):
 *   - one IN_PROGRESS attempt per user: `activeUserId` = userId while in
 *     progress, NULL otherwise, @unique + CHECK;
 *   - no position and no item twice in an attempt: two @@unique.
 * These functions only translate the resulting conflicts into results.
 *
 * Nothing here returns an answer key or an explanation.
 */

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type DiagnosticKind = 'VOCAB' | 'GRAMMAR' | 'LISTENING';

/** An IN_PROGRESS attempt idle for longer than this is abandoned on next start. */
export const ATTEMPT_IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

/**
 * The user's IN_PROGRESS attempt with whether it is still fresh: idle (no
 * answer, or start) for at most ATTEMPT_IDLE_LIMIT_MS.
 */
async function findActive(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  userId: string,
  now: Date,
): Promise<{ id: string; fresh: boolean } | null> {
  const active = await db.diagnosticAttempt.findUnique({
    where: { activeUserId: userId },
    select: {
      id: true,
      startedAt: true,
      answers: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  if (!active) return null;
  const lastActivity = Math.max(
    active.startedAt.getTime(),
    active.answers[0]?.createdAt.getTime() ?? 0,
  );
  return { id: active.id, fresh: now.getTime() - lastActivity <= ATTEMPT_IDLE_LIMIT_MS };
}

/**
 * The attempt the learner would resume, without writing anything: null when
 * there is none or it has been idle too long (startOrResumeAttempt abandons
 * that one and starts over).
 */
export async function getActiveAttempt(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  userId: string,
  now: Date,
): Promise<{ attemptId: string } | null> {
  const active = await findActive(db, userId, now);
  return active?.fresh ? { attemptId: active.id } : null;
}

/**
 * The user's IN_PROGRESS attempt, or a new one. An attempt idle for over 24 h
 * (no answer, or start, since) is abandoned first, so the learner starts over.
 * Two tabs racing to create both end up on the same attempt.
 */
export async function startOrResumeAttempt(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  userId: string,
  now: Date,
): Promise<{ attemptId: string; resumed: boolean }> {
  const active = await findActive(db, userId, now);
  if (active?.fresh) return { attemptId: active.id, resumed: true };
  if (active) {
    await db.diagnosticAttempt.updateMany({
      where: { id: active.id, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', activeUserId: null },
    });
  }

  try {
    const created = await db.diagnosticAttempt.create({
      data: { userId, activeUserId: userId, startedAt: now },
      select: { id: true },
    });
    return { attemptId: created.id, resumed: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Another request created it between our read and our insert.
    const winner = await db.diagnosticAttempt.findUnique({
      where: { activeUserId: userId },
      select: { id: true },
    });
    if (!winner) throw e;
    return { attemptId: winner.id, resumed: true };
  }
}

/**
 * The user's completed attempt, if any. The diagnostic is taken once in MVP:
 * with a completed attempt there is nothing to start.
 */
export async function getCompletedAttempt(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  userId: string,
): Promise<{ attemptId: string } | null> {
  const row = await db.diagnosticAttempt.findFirst({
    where: { userId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true },
  });
  return row ? { attemptId: row.id } : null;
}

/**
 * Every concept, as the diagnostic bootstrap maps it to an axis and a level.
 * The one source of the bootstrap's concept list (the learner-model service
 * takes it as input).
 */
export async function getBootstrapConcepts(db: Pick<PrismaClient, 'concept'>): Promise<
  {
    id: string;
    category: 'GRAMMAR' | 'VOCAB' | 'LISTENING' | 'PHONETICS' | 'DISCOURSE' | 'PRAGMATICS';
    cefrLevel: CefrLevel;
  }[]
> {
  return db.concept.findMany({
    select: { id: true, category: true, cefrLevel: true },
    orderBy: { id: 'asc' },
  });
}

export type DiagnosticAttemptState = {
  attemptId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  /** In position order — the ladder's replay input. */
  answers: {
    position: number;
    itemId: string;
    axis: DiagnosticKind;
    itemLevel: CefrLevel;
    correct: boolean;
    dontKnow: boolean;
  }[];
};

/** The attempt as the ladder needs it; null for an unknown or foreign attempt. */
export async function getAttemptState(
  db: Pick<PrismaClient, 'diagnosticAttempt'>,
  attemptId: string,
  userId: string,
): Promise<DiagnosticAttemptState | null> {
  const attempt = await db.diagnosticAttempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      status: true,
      answers: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          itemId: true,
          itemLevel: true,
          isCorrect: true,
          dontKnow: true,
          item: { select: { kind: true } },
        },
      },
    },
  });
  if (!attempt) return null;
  return {
    attemptId,
    status: attempt.status,
    answers: attempt.answers.map((a) => ({
      position: a.position,
      itemId: a.itemId,
      axis: a.item.kind,
      itemLevel: a.itemLevel,
      correct: a.isCorrect,
      dontKnow: a.dontKnow,
    })),
  };
}

/** Every PUBLISHED diagnostic question, as the ladder chooses among them. */
export async function getDiagnosticPool(
  db: Pick<PrismaClient, 'diagnosticItem'>,
): Promise<{ id: string; kind: DiagnosticKind; cefrLevel: CefrLevel }[]> {
  return db.diagnosticItem.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, kind: true, cefrLevel: true },
    orderBy: { id: 'asc' },
  });
}

export type AppendAnswerInput = {
  attemptId: string;
  userId: string;
  position: number;
  /** The question answered; its level is read from the bank, not trusted from the caller. */
  itemId: string;
  correct: boolean;
  dontKnow: boolean;
  /** The submitted choice as text (DiagnosticAnswer.userAnswer); "" for don't-know. */
  userAnswer: string;
  timeMs?: number;
};

export type AppendAnswerResult =
  | { ok: true }
  /** Unknown, foreign, completed or abandoned attempt. */
  | { ok: false; error: 'NOT_IN_PROGRESS' }
  /** This position or this item is already answered in the attempt. */
  | { ok: false; error: 'DUPLICATE' }
  /** No PUBLISHED diagnostic question with this id. */
  | { ok: false; error: 'ITEM_NOT_FOUND' };

/**
 * Record one answer, only into the user's own IN_PROGRESS attempt and only
 * for a PUBLISHED question, whose level is stored as DiagnosticAnswer.itemLevel
 * (the ladder's input — never the caller's word for it). The attempt row is
 * locked for the insert, so a concurrent completeAttempt either sees the
 * answer or the insert sees COMPLETED — never both.
 */
export async function appendAnswer(
  db: Pick<PrismaClient, '$transaction'>,
  input: AppendAnswerInput,
): Promise<AppendAnswerResult> {
  try {
    return await db.$transaction(async (tx) => {
      const open = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "DiagnosticAttempt"
        WHERE "id" = ${input.attemptId}
          AND "userId" = ${input.userId}
          AND "status" = 'IN_PROGRESS'
        FOR UPDATE`;
      if (open.length === 0) return { ok: false, error: 'NOT_IN_PROGRESS' } as const;

      const item = await tx.diagnosticItem.findFirst({
        where: { id: input.itemId, status: 'PUBLISHED' },
        select: { cefrLevel: true },
      });
      if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' } as const;

      await tx.diagnosticAnswer.create({
        data: {
          attemptId: input.attemptId,
          itemId: input.itemId,
          itemLevel: item.cefrLevel,
          position: input.position,
          isCorrect: input.correct,
          dontKnow: input.dontKnow,
          userAnswer: input.userAnswer,
          timeMs: input.timeMs ?? null,
        },
      });
      return { ok: true } as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'DUPLICATE' };
    throw e;
  }
}

/**
 * Close the attempt and record the level, on the attempt and on the profile,
 * in one transaction. Only one caller wins: a repeated or concurrent
 * completion gets { won: false } and must not bootstrap again.
 */
export async function completeAttempt(
  db: Pick<PrismaClient, '$transaction'>,
  input: { attemptId: string; userId: string; assessedLevel: CefrLevel; now: Date },
): Promise<{ won: boolean }> {
  return db.$transaction(async (tx) => {
    const closed = await tx.diagnosticAttempt.updateMany({
      where: { id: input.attemptId, userId: input.userId, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        activeUserId: null,
        completedAt: input.now,
        assessedLevel: input.assessedLevel,
      },
    });
    if (closed.count !== 1) return { won: false };

    // No profile (a non-student role) is fine: nothing to show the level on.
    await tx.studentProfile.updateMany({
      where: { userId: input.userId },
      data: { assessedLevel: input.assessedLevel },
    });
    return { won: true };
  });
}
