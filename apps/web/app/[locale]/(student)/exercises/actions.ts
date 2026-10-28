'use server';

import { prisma } from '@englishlearn/db';
import { getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import { getConceptTitle, isLocale } from '@englishlearn/db/schemas';
import type { WeekRhythm } from '@englishlearn/learner-model';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { decryptItemRef } from '@/lib/crypto/item-ref';
import { loadNextExercise } from '@/lib/exercise/load';
import { loadWeekRhythm } from '@/lib/exercise/rhythm';
import {
  consequenceFor,
  contentLocale,
  correctAnswerOf,
  type ExerciseFeedback,
  type ExerciseView,
  explanationFor,
  fillGap,
  gradeAnswer,
  RECENT_EXCLUDE,
  reviewFor,
  type Verdict,
} from '@/lib/exercise/view';
import { learnerService } from '@/lib/learner';
import type { Result } from '@/lib/result';

export type ExerciseActionError = 'UNAUTHENTICATED' | 'INVALID' | 'NOT_FOUND' | 'UNAVAILABLE';

/** An opaque item reference (`lib/crypto/item-ref.ts`), never a raw id. */
const ItemRefSchema = z.string().min(1).max(1024);

const SubmitSchema = z.object({
  itemRef: ItemRefSchema,
  answer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('choice'), index: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('text'), value: z.string().max(200) }),
    z.object({ type: z.literal('dontKnow') }),
  ]),
  /** Time from showing the question to answering; dropped if implausible. */
  timeMs: z.number().int().positive().max(3_600_000).optional(),
  /** The hint was opened at least once on this question (§8 #11). */
  hinted: z.boolean().optional(),
  /**
   * One per question shown, reused by every resend of it: a retry after a
   * lost reply records nothing new. Optional so a page loaded before this
   * field existed still submits.
   */
  attemptKey: z.uuid().optional(),
});

async function currentLocale() {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'en';
}

/**
 * The next exercise for the signed-in learner, skipping recently shown items.
 * The recent list only steers selection: a reference that does not decrypt
 * for this learner (expired, foreign, forged) is dropped, not an error.
 */
export async function nextExercise(
  recentItemRefs: string[],
): Promise<Result<ExerciseView | null, ExerciseActionError>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'UNAUTHENTICATED' };
  const userId = session.user.id;

  const parsed = z.array(ItemRefSchema).max(20).safeParse(recentItemRefs);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const recent = await Promise.all(
    parsed.data.slice(-RECENT_EXCLUDE).map((ref) => decryptItemRef(ref, userId)),
  );

  const view = await loadNextExercise({
    userId,
    locale: await currentLocale(),
    excludeItemIds: recent.flatMap((r) => (r.ok ? [r.value] : [])),
  });
  return { ok: true, value: view };
}

/**
 * Grade one answer on the server, record it through the learner model's
 * single write path, and return the inline feedback.
 */
export async function submitExerciseAttempt(
  input: z.input<typeof SubmitSchema>,
): Promise<Result<ExerciseFeedback, ExerciseActionError>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const { itemRef, answer, timeMs, hinted, attemptKey } = parsed.data;
  // Forged, foreign or expired: nothing is recorded.
  const ref = await decryptItemRef(itemRef, session.user.id);
  if (!ref.ok) return { ok: false, error: 'INVALID' };
  const itemId = ref.value;

  const [item, nativeLanguage] = await Promise.all([
    getPublishedPracticeItem(itemId),
    getNativeLanguage(prisma, session.user.id),
  ]);
  if (!item) return { ok: false, error: 'NOT_FOUND' };

  const graded = gradeAnswer(item.practice, answer);
  const base = { userId: session.user.id, itemId, timeMs, hinted, idempotencyKey: attemptKey };
  const recorded = await learnerService.recordOutcome(
    graded === 'dontKnow'
      ? { ...base, dontKnow: true }
      : { ...base, correct: graded === 'correct' },
  );
  if (!recorded.ok) {
    // A key reused for another item is a client bug or tampering, not a miss.
    return {
      ok: false,
      error: recorded.error === 'IDEMPOTENCY_CONFLICT' ? 'INVALID' : 'NOT_FOUND',
    };
  }

  // A resend of an answer already recorded: report what was recorded, never
  // the resend's own answer (the learner may have changed it after the reply
  // was lost). Its option is marked only if it grades the same way.
  const original = recorded.duplicate ? recorded.original : null;
  const verdict: Verdict = original
    ? original.dontKnow
      ? 'dontKnow'
      : original.correct
        ? 'correct'
        : 'incorrect'
    : graded;

  const locale = await currentLocale();
  const correctAnswer = correctAnswerOf(item.practice);
  // The "why" is help in the learner's language; the consequence line is chrome.
  const { why, more } = explanationFor(
    item.kind,
    item.content,
    contentLocale(nativeLanguage, locale),
  );

  return {
    ok: true,
    value: {
      verdict,
      chosenIndex: answer.type === 'choice' && verdict === graded ? answer.index : null,
      correctIndex: item.practice.type === 'choice' ? item.practice.correctIndex : null,
      correctAnswer,
      answerSentence: fillGap(item.practice.prompt, correctAnswer),
      why,
      more,
      consequence: consequenceFor({
        conceptTitle: getConceptTitle(item.concept, locale),
        stageBefore: recorded.stageBefore,
        stageAfter: recorded.stageAfter,
        scheduledDays: recorded.scheduledDays,
        hinted: original ? original.hinted : hinted,
      }),
      review: reviewFor(recorded.scheduledDays),
    },
  };
}

/**
 * This week's sessions for the session summary. `timeZone` is the client's
 * IANA zone; anything invalid is treated as UTC (never trusted as-is).
 */
export async function weekRhythm(
  timeZone: unknown,
): Promise<Result<WeekRhythm, ExerciseActionError>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'UNAUTHENTICATED' };
  try {
    return { ok: true, value: await loadWeekRhythm({ userId: session.user.id, timeZone }) };
  } catch (err) {
    // The summary just hides the rhythm; the cause belongs in the server log.
    console.error('weekRhythm failed', err);
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
