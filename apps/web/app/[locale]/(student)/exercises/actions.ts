'use server';

import { prisma } from '@englishlearn/db';
import { getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import { getConceptTitle, isLocale } from '@englishlearn/db/schemas';
import type { WeekRhythm } from '@englishlearn/learner-model';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
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
} from '@/lib/exercise/view';
import { learnerService } from '@/lib/learner';
import type { Result } from '@/lib/result';

export type ExerciseActionError = 'UNAUTHENTICATED' | 'INVALID' | 'NOT_FOUND' | 'UNAVAILABLE';

const ItemIdSchema = z.string().min(1).max(200);

const SubmitSchema = z.object({
  itemId: ItemIdSchema,
  answer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('choice'), index: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('text'), value: z.string().max(200) }),
    z.object({ type: z.literal('dontKnow') }),
  ]),
  /** Time from showing the question to answering; dropped if implausible. */
  timeMs: z.number().int().positive().max(3_600_000).optional(),
});

async function currentLocale() {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'en';
}

/** The next exercise for the signed-in learner, skipping recently shown items. */
export async function nextExercise(
  recentItemIds: string[],
): Promise<Result<ExerciseView | null, ExerciseActionError>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = z.array(ItemIdSchema).max(20).safeParse(recentItemIds);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  const view = await loadNextExercise({
    userId: session.user.id,
    locale: await currentLocale(),
    excludeItemIds: parsed.data.slice(-RECENT_EXCLUDE),
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
  const { itemId, answer, timeMs } = parsed.data;

  const [item, nativeLanguage] = await Promise.all([
    getPublishedPracticeItem(itemId),
    getNativeLanguage(prisma, session.user.id),
  ]);
  if (!item) return { ok: false, error: 'NOT_FOUND' };

  const verdict = gradeAnswer(item.practice, answer);
  const recorded = await learnerService.recordOutcome(
    verdict === 'dontKnow'
      ? { userId: session.user.id, itemId, dontKnow: true, timeMs }
      : { userId: session.user.id, itemId, correct: verdict === 'correct', timeMs },
  );
  if (!recorded.ok) return { ok: false, error: 'NOT_FOUND' };

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
      chosenIndex: answer.type === 'choice' ? answer.index : null,
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
