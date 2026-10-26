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
import {
  type DiagnosticRevealFacts,
  getDiagnosticRevealFacts,
  getPlacementContext,
} from '@englishlearn/db/queries/diagnostic-reveal';
import {
  checkDiagnosticAnswer,
  getConceptTitles,
  getDiagnosticItemForStudent,
} from '@englishlearn/db/queries/exercises';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import type { CefrLevelValue, DiagnosticAxisValue, Locale } from '@englishlearn/db/schemas';
import { buildPlacementReveal, nextLadderStep, TOTAL_QUESTIONS } from '@englishlearn/learner-model';
import { bootstrapService } from '@/lib/learner';
import type { Result } from '@/lib/result';

/**
 * Diagnostic orchestrator: the ladder (pure, learner-model) over the attempt
 * stored in the database. Stateless — every call replays the attempt's
 * answers, so a reload resumes exactly where the learner left off, and the
 * question to answer next is recomputed, never trusted from the client.
 *
 * No feedback during the test: nothing returned here carries the verdict,
 * the key, an explanation or the question's level. The result after the test
 * carries levels only — per axis and overall — and a suggested first topic.
 */

/** What the learner sees of a question. */
export type DiagnosticQuestionView = {
  attemptId: string;
  /** 0-based; the learner sees position + 1 of `total`. */
  position: number;
  total: number;
  item: { id: string; stem: string; choices: string[] };
};

/**
 * The result screen. Built field by field from the placement reveal — an
 * allowlist, never a spread: the reveal also carries per-tag tallies
 * (correct, dontKnow, accuracy) that must not reach the learner as a "level".
 */
export type DiagnosticResultView = {
  /** Null when the attempt has no level to show; the screen still offers practice. */
  level: CefrLevelValue | null;
  axes: { axis: DiagnosticAxisValue; level: CefrLevelValue }[];
  /** A suggestion, not a promise: the first exercise is still the policy's pick. */
  startConcept: { title: string } | null;
};

const NO_RESULT: DiagnosticResultView = { level: null, axes: [], startConcept: null };

/** Display order on the result screen: "Grammar B1 · Vocabulary B2". */
const AXIS_DISPLAY_ORDER: readonly DiagnosticAxisValue[] = ['GRAMMAR', 'VOCAB', 'LISTENING'];

export type DiagnosticStep =
  | { kind: 'question'; question: DiagnosticQuestionView }
  | { kind: 'completed'; result: DiagnosticResultView };

/**
 * What a visit to /diagnostic shows; `intro` until the learner presses Start,
 * and before the intro `language` while their native language is unknown.
 */
export type DiagnosticPeek = DiagnosticStep | { kind: 'intro' } | { kind: 'language' };

export type DiagnosticError =
  /** Unknown, foreign or abandoned attempt. */
  | 'NOT_IN_PROGRESS'
  /** The question vanished from the published bank mid-attempt. */
  | 'ITEM_NOT_FOUND'
  /** No unanswered question left on an axis — a bank problem, logged. */
  | 'BANK_EXHAUSTED'
  /** A new attempt needs the learner's native language first. */
  | 'NEEDS_LANGUAGE';

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
 * Whether the learner has finished the diagnostic: a COMPLETED attempt — the
 * signal /diagnostic itself shows the result on. Every CTA asks this, so they
 * never disagree: a completed attempt whose bootstrap did not land (a failure,
 * NO_CONCEPTS_BOOTSTRAPPED) is still done, and /diagnostic retries that
 * bootstrap. Read-only.
 */
export async function isDiagnosticDone(userId: string): Promise<boolean> {
  return (await getCompletedAttempt(prisma, userId)) !== null;
}

/**
 * Whether the learner has chosen a native language. Any non-empty stored
 * value counts, even one outside today's list: it was their choice. Never
 * inferred from the interface locale.
 */
async function hasNativeLanguage(userId: string): Promise<boolean> {
  return ((await getNativeLanguage(prisma, userId)) ?? '').trim() !== '';
}

/**
 * What the learner sees on arrival — without starting anything: their result,
 * the question of the attempt they left, the native-language step, or the
 * intro. Merely opening the page must not create an attempt or write the
 * language. The language step only stands before a new attempt: a result or
 * an attempt in progress is never hidden behind it.
 */
export async function peekDiagnosticStep(
  userId: string,
  now: Date,
  locale: Locale,
): Promise<Result<DiagnosticPeek, DiagnosticError>> {
  const completed = await getCompletedAttempt(prisma, userId);
  if (completed) {
    return { ok: true, value: await completedStep(userId, completed.attemptId, locale, true) };
  }
  const active = await getActiveAttempt(prisma, userId, now);
  if (!active) {
    return { ok: true, value: { kind: (await hasNativeLanguage(userId)) ? 'intro' : 'language' } };
  }
  return stepOf(userId, active.attemptId, now, locale);
}

/**
 * Start (or resume) the attempt: the completed result, or the next question.
 * A new attempt is refused (`NEEDS_LANGUAGE`) until the native language is
 * chosen; one in progress resumes regardless.
 */
export async function getDiagnosticStep(
  userId: string,
  now: Date,
  locale: Locale,
): Promise<Result<DiagnosticStep, DiagnosticError>> {
  const completed = await getCompletedAttempt(prisma, userId);
  if (completed) {
    // A bootstrap that failed right after completion is finished here.
    return { ok: true, value: await completedStep(userId, completed.attemptId, locale, true) };
  }
  if (!(await hasNativeLanguage(userId)) && !(await getActiveAttempt(prisma, userId, now))) {
    return { ok: false, error: 'NEEDS_LANGUAGE' };
  }
  const { attemptId } = await startOrResumeAttempt(prisma, userId, now);
  return stepOf(userId, attemptId, now, locale);
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
  locale: Locale,
): Promise<Result<DiagnosticSubmitOutcome, DiagnosticError>> {
  const current = await stepOf(userId, input.attemptId, now, locale);
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

  const next = await stepOf(userId, input.attemptId, now, locale);
  return next.ok ? { ok: true, value: { stale: false, step: next.value } } : next;
}

/** Replay the attempt through the ladder; finalize it once all answers are in. */
async function stepOf(
  userId: string,
  attemptId: string,
  now: Date,
  locale: Locale,
): Promise<Result<DiagnosticStep, DiagnosticError>> {
  const state = await getAttemptState(prisma, attemptId, userId);
  if (state?.status === 'COMPLETED') {
    return { ok: true, value: await completedStep(userId, attemptId, locale, true) };
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
    case 'complete': {
      // Reached by the last submit, or by the next visit if the process died
      // between storing the last answer and completing the attempt.
      const won = await finalize(userId, attemptId, step.assessedLevel, now);
      return { ok: true, value: await completedStep(userId, attemptId, locale, won) };
    }
    case 'exhausted':
      console.error(`[diagnostic] bank exhausted on ${step.axis} (attempt ${attemptId})`);
      return { ok: false, error: 'BANK_EXHAUSTED' };
  }
}

/** Close the attempt; true for the call that actually closed it (and so bootstraps). */
async function finalize(
  userId: string,
  attemptId: string,
  assessedLevel: Parameters<typeof completeAttempt>[1]['assessedLevel'],
  now: Date,
): Promise<boolean> {
  const { won } = await completeAttempt(prisma, { attemptId, userId, assessedLevel, now });
  return won;
}

/**
 * The completed step: bootstrap first when asked (the start concept reads
 * the post-bootstrap mastery), then the result. Never throws — a failure
 * shows the level-less result, which still leads to practice.
 */
async function completedStep(
  userId: string,
  attemptId: string,
  locale: Locale,
  bootstrap: boolean,
): Promise<DiagnosticStep> {
  try {
    const facts = await getDiagnosticRevealFacts(prisma, { userId, attemptId });
    if (!facts) {
      console.error(`[diagnostic] no completed attempt ${attemptId} to show`);
      return { kind: 'completed', result: NO_RESULT };
    }
    if (bootstrap) await ensureBootstrapped(userId, attemptId, facts);
    return { kind: 'completed', result: await resultOf(userId, attemptId, facts, locale) };
  } catch (e) {
    console.error(`[diagnostic] result failed for attempt ${attemptId}`, e);
    return { kind: 'completed', result: NO_RESULT };
  }
}

async function resultOf(
  userId: string,
  attemptId: string,
  facts: DiagnosticRevealFacts,
  locale: Locale,
): Promise<DiagnosticResultView> {
  const context = await getPlacementContext(prisma, userId);
  const reveal = buildPlacementReveal({ answers: facts.answers, ...context });
  if (reveal.level !== facts.assessedLevel) {
    // Both come from the ladder's formula; a mismatch means it changed after
    // the attempt was stored. The screen shows the recomputed level.
    console.warn(
      `[diagnostic] level mismatch for attempt ${attemptId}: stored ${facts.assessedLevel}, recomputed ${reveal.level}`,
    );
  }
  const title = reveal.startConcept
    ? (await getConceptTitles([reveal.startConcept], locale)).get(reveal.startConcept)
    : undefined;
  return {
    level: reveal.level,
    axes: reveal.axes
      .map((a) => ({ axis: a.axis, level: a.level }))
      .sort((x, y) => AXIS_DISPLAY_ORDER.indexOf(x.axis) - AXIS_DISPLAY_ORDER.indexOf(y.axis)),
    startConcept: title ? { title } : null,
  };
}

/**
 * Seed the learner model from a completed attempt. Idempotent: the service
 * writes at most one LEARNER_BOOTSTRAPPED per user (ALREADY_BOOTSTRAPPED is
 * success). Never throws — a failure is logged and retried on the next visit
 * to the result, so the learner is never stuck on it.
 *
 * Takes the facts it was read with instead of reading them again: safe only
 * because they belong to a COMPLETED attempt (getDiagnosticRevealFacts loads
 * nothing else), whose answers can no longer change.
 */
async function ensureBootstrapped(
  userId: string,
  attemptId: string,
  facts: DiagnosticRevealFacts,
): Promise<void> {
  try {
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
