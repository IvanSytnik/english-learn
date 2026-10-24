import 'server-only';

import { prisma } from '@englishlearn/db';
import {
  appendAnswer,
  completeAttempt,
  getActiveAttempt,
  getAttemptState,
  getBootstrapConcepts,
  getCompletedAttempt,
  getDiagnosticPool,
  startOrResumeAttempt,
} from '@englishlearn/db/queries/diagnostic-attempt';
import { getDiagnosticRevealFacts } from '@englishlearn/db/queries/diagnostic-reveal';
import {
  checkDiagnosticAnswer,
  getDiagnosticItemForStudent,
} from '@englishlearn/db/queries/exercises';
import { nextLadderStep, TOTAL_QUESTIONS } from '@englishlearn/learner-model';
import { bootstrapService } from '@/lib/learner';
import type { Result } from '@/lib/result';

/**
 * Diagnostic orchestrator: the ladder (pure, learner-model) over the attempt
 * stored in the database. Stateless — every call replays the attempt's
 * answers, so a reload resumes exactly where the learner left off, and the
 * question to answer next is recomputed, never trusted from the client.
 *
 * No feedback during the test: nothing returned here carries the verdict,
 * the key, an explanation or the question's level.
 */

/** What the learner sees of a question. */
export type DiagnosticQuestionView = {
  attemptId: string;
  /** 0-based; the learner sees position + 1 of `total`. */
  position: number;
  total: number;
  item: { id: string; stem: string; choices: string[] };
};

export type DiagnosticStep =
  | { kind: 'question'; question: DiagnosticQuestionView }
  | { kind: 'completed'; attemptId: string };

/** What a visit to /diagnostic shows; `intro` until the learner presses Start. */
export type DiagnosticPeek = DiagnosticStep | { kind: 'intro' };

export type DiagnosticError =
  /** Unknown, foreign or abandoned attempt. */
  | 'NOT_IN_PROGRESS'
  /** The question vanished from the published bank mid-attempt. */
  | 'ITEM_NOT_FOUND'
  /** No unanswered question left on an axis — a bank problem, logged. */
  | 'BANK_EXHAUSTED';

export type DiagnosticAnswerInput = { attemptId: string; position: number; itemId: string } & (
  | { choiceIndex: number; dontKnow?: never }
  | { dontKnow: true; choiceIndex?: never }
);

export type DiagnosticSubmitOutcome = {
  /** The answer was not for the current question: nothing was recorded. */
  stale: boolean;
  step: DiagnosticStep;
};

/**
 * What the learner sees on arrival — without starting anything: their result,
 * the question of the attempt they left, or the intro. Merely opening the
 * page must not create an attempt.
 */
export async function peekDiagnosticStep(
  userId: string,
  now: Date,
): Promise<Result<DiagnosticPeek, DiagnosticError>> {
  const completed = await getCompletedAttempt(prisma, userId);
  if (completed) {
    await ensureBootstrapped(userId, completed.attemptId);
    return { ok: true, value: { kind: 'completed', attemptId: completed.attemptId } };
  }
  const active = await getActiveAttempt(prisma, userId, now);
  if (!active) return { ok: true, value: { kind: 'intro' } };
  return stepOf(userId, active.attemptId, now);
}

/** Start (or resume) the attempt: the completed result, or the next question. */
export async function getDiagnosticStep(
  userId: string,
  now: Date,
): Promise<Result<DiagnosticStep, DiagnosticError>> {
  const completed = await getCompletedAttempt(prisma, userId);
  if (completed) {
    // A bootstrap that failed right after completion is finished here.
    await ensureBootstrapped(userId, completed.attemptId);
    return { ok: true, value: { kind: 'completed', attemptId: completed.attemptId } };
  }
  const { attemptId } = await startOrResumeAttempt(prisma, userId, now);
  return stepOf(userId, attemptId, now);
}

/**
 * Record an answer to the current question and return the next step. An
 * answer for any other question is not recorded (`stale`); a repeated submit
 * of the same answer lands on the same next step with one stored answer.
 */
export async function submitDiagnosticAnswer(
  userId: string,
  input: DiagnosticAnswerInput,
  now: Date,
): Promise<Result<DiagnosticSubmitOutcome, DiagnosticError>> {
  const current = await stepOf(userId, input.attemptId, now);
  if (!current.ok) return current;
  const expected = current.value;
  if (
    expected.kind !== 'question' ||
    expected.question.position !== input.position ||
    expected.question.item.id !== input.itemId
  ) {
    return { ok: true, value: { stale: true, step: expected } };
  }

  let correct = false;
  if (!input.dontKnow) {
    const verdict = await checkDiagnosticAnswer(input.itemId, input.choiceIndex);
    if (!verdict) return { ok: false, error: 'ITEM_NOT_FOUND' };
    correct = verdict.correct;
  }

  const appended = await appendAnswer(prisma, {
    attemptId: input.attemptId,
    userId,
    position: input.position,
    itemId: input.itemId,
    correct,
    dontKnow: input.dontKnow === true,
    userAnswer: input.dontKnow ? '' : String(input.choiceIndex),
  });
  // DUPLICATE: a concurrent submit of this position won — same next step.
  if (!appended.ok && appended.error !== 'DUPLICATE') {
    return { ok: false, error: appended.error };
  }

  const next = await stepOf(userId, input.attemptId, now);
  return next.ok ? { ok: true, value: { stale: false, step: next.value } } : next;
}

/** Replay the attempt through the ladder; finalize it once all answers are in. */
async function stepOf(
  userId: string,
  attemptId: string,
  now: Date,
): Promise<Result<DiagnosticStep, DiagnosticError>> {
  const state = await getAttemptState(prisma, attemptId, userId);
  if (state?.status === 'COMPLETED') {
    await ensureBootstrapped(userId, attemptId);
    return { ok: true, value: { kind: 'completed', attemptId } };
  }
  if (state?.status !== 'IN_PROGRESS') return { ok: false, error: 'NOT_IN_PROGRESS' };

  const pool = (await getDiagnosticPool(prisma)).map((p) => ({
    id: p.id,
    axis: p.kind,
    cefrLevel: p.cefrLevel,
  }));
  const step = nextLadderStep({ attemptId, answers: state.answers, pool });

  switch (step.kind) {
    case 'question': {
      const item = await getDiagnosticItemForStudent(step.itemId);
      if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
      return {
        ok: true,
        value: {
          kind: 'question',
          question: {
            attemptId,
            position: step.position,
            total: TOTAL_QUESTIONS,
            item: { id: item.id, stem: item.stem, choices: item.choices },
          },
        },
      };
    }
    case 'complete':
      // Reached by the last submit, or by the next visit if the process died
      // between storing the last answer and completing the attempt.
      await finalize(userId, attemptId, step.assessedLevel, now);
      return { ok: true, value: { kind: 'completed', attemptId } };
    case 'exhausted':
      console.error(`[diagnostic] bank exhausted on ${step.axis} (attempt ${attemptId})`);
      return { ok: false, error: 'BANK_EXHAUSTED' };
  }
}

/** Close the attempt; only the call that actually closed it bootstraps. */
async function finalize(
  userId: string,
  attemptId: string,
  assessedLevel: Parameters<typeof completeAttempt>[1]['assessedLevel'],
  now: Date,
): Promise<void> {
  const { won } = await completeAttempt(prisma, { attemptId, userId, assessedLevel, now });
  if (won) await ensureBootstrapped(userId, attemptId);
}

/**
 * Seed the learner model from a completed attempt. Idempotent: the service
 * writes at most one LEARNER_BOOTSTRAPPED per user (ALREADY_BOOTSTRAPPED is
 * success). Never throws — a failure is logged and retried on the next visit
 * to the result, so the learner is never stuck on it.
 */
async function ensureBootstrapped(userId: string, attemptId: string): Promise<void> {
  try {
    const facts = await getDiagnosticRevealFacts(prisma, { userId, attemptId });
    if (!facts) {
      console.error(`[diagnostic] no completed attempt ${attemptId} to bootstrap from`);
      return;
    }
    const result = await bootstrapService.bootstrapFromDiagnostic({
      userId,
      diagnosticAttemptId: attemptId,
      assessedLevel: facts.assessedLevel,
      answers: facts.answers.map((a) => ({
        axis: a.axis,
        correct: a.correct,
        dontKnow: a.dontKnow,
        itemLevel: a.itemLevel,
        position: a.position,
      })),
      concepts: await getBootstrapConcepts(prisma),
    });
    if (!result.ok && result.error === 'NO_CONCEPTS_BOOTSTRAPPED') {
      console.error(`[diagnostic] attempt ${attemptId} bootstrapped no concept`);
    }
  } catch (e) {
    console.error(`[diagnostic] bootstrap failed for attempt ${attemptId}`, e);
  }
}
