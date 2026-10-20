import 'server-only';

import { getConceptTitles, getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import type { Locale } from '@englishlearn/db/schemas';
import { selectionService } from '@/lib/learner';
import { type ExerciseView, hintFor, reasonDetail, toQuestion } from './view';

/**
 * Pick the learner's next exercise and shape it for the player.
 *
 * selectNext seeds its RNG per call from (now, userId) — the boundary the
 * policy expects; tests pass a seed instead. Returns null when nothing is
 * selectable (empty pool or everything gated).
 */
export async function loadNextExercise(args: {
  userId: string;
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

  const item = await getPublishedPracticeItem(selection.itemId);
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
    hint: hintFor(item.kind, item.content, args.locale),
  };
}
