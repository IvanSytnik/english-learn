import 'server-only';

import { prisma } from '@englishlearn/db';
import { getConceptTitles, getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import type { Locale } from '@englishlearn/db/schemas';
import { selectionService } from '@/lib/learner';
import { contentLocale, type ExerciseView, hintFor, reasonDetail, toQuestion } from './view';

/**
 * Pick the learner's next exercise and shape it for the player.
 *
 * selectNext seeds its RNG per call from (now, userId) — the boundary the
 * policy expects; tests pass a seed instead. Returns null when nothing is
 * selectable (empty pool or everything gated).
 */
export async function loadNextExercise(args: {
  userId: string;
  /** The interface locale (URL): concept titles. The hint follows the native language. */
  locale: Locale;
  excludeItemIds?: readonly string[];
  nowMs?: number;
}): Promise<ExerciseView | null> {
  const now = args.nowMs ?? Date.now();
  const outcome = await selectionService.selectNext({
    userId: args.userId,
    nowMs: now,
    excludeItemIds: args.excludeItemIds,
  });
  if (!outcome.ok) return null;
  const selection = outcome.result;

  const [item, nativeLanguage] = await Promise.all([
    getPublishedPracticeItem(selection.itemId),
    getNativeLanguage(prisma, args.userId),
  ]);
  if (!item) return null;

  const titles = await getConceptTitles(
    [selection.conceptId, ...selection.unlockedBy],
    args.locale,
  );

  return {
    itemId: item.id,
    conceptTitle: titles.get(selection.conceptId) ?? item.concept.name,
    reason: selection.reason,
    isNewConcept: selection.isNewConcept,
    detail: reasonDetail({
      isNewConcept: selection.isNewConcept,
      unlockedByTitles: selection.unlockedBy.map((id) => titles.get(id) ?? id),
      lastPracticedAt: selection.lastPracticedAt,
      now,
    }),
    question: toQuestion(item.practice),
    // The hint is help in the learner's language; titles above are chrome.
    hint: hintFor(item.kind, item.content, contentLocale(nativeLanguage, args.locale)),
  };
}
