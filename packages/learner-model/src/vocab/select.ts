import type { FsrsCardStatus } from '../core/fsrs/types';
import { CEFR_RANK, type CEFRLevel } from '../core/graph/types';
import { seedFromString } from '../policy/rng';
import { vocabModeFor } from './ladder';
import type { VocabMode } from './types';

/**
 * The vocabulary session's next word (B2.5). Pure, deterministic, its own
 * pool — never the grammar candidates. Priority:
 *
 *   1. REVIEW_DUE — a word in review whose FSRS due moment has come, the
 *      most overdue first;
 *   2. LEARNING   — a word in (re)learning whose short step is due;
 *   3. NEW        — a never-answered word, while today's new words are under
 *      the learner's dailyVocabLimit. Words at the learner's assessed level
 *      first (then the nearest levels, lower before higher; A1 first without
 *      a level), in a per-day order: `seedFromString(seed:itemId)`.
 *
 * Otherwise NOTHING_DUE with the next due moment. `excludeItemIds` (the words
 * just shown) is ignored when it would leave nothing to serve.
 */

export type VocabCandidate = {
  itemId: string;
  cefrLevel: CEFRLevel;
  /** The learner's ItemReviewState; null = never answered. */
  review: {
    dueAt: bigint;
    cardStatus: FsrsCardStatus;
    stability: number;
    lastReviewAt: bigint | null;
  } | null;
};

export type VocabSelectionReason = 'REVIEW_DUE' | 'LEARNING' | 'NEW';

export type VocabSelection =
  | {
      ok: true;
      itemId: string;
      reason: VocabSelectionReason;
      /** Ladder mode for the word's state (the card may fall back — see buildVocabCard). */
      mode: VocabMode;
      remainingNew: number;
    }
  | { ok: false; reason: 'NOTHING_DUE'; nextDueAt: bigint | null; remainingNew: number };

export type VocabSelectInput = {
  candidates: readonly VocabCandidate[];
  nowMs: number;
  /** New words already introduced today (countNewVocabWordsSince). */
  newToday: number;
  dailyLimit: number;
  /** StudentProfile.assessedLevel; null before the diagnostic. */
  targetLevel: CEFRLevel | null;
  /** Fixes the order of new words — the service passes `userId:dayStart`. */
  seed: string;
  excludeItemIds?: readonly string[];
};

export function selectVocab(input: VocabSelectInput): VocabSelection {
  const remainingNew = Math.max(0, input.dailyLimit - input.newToday);
  const excluded = new Set(input.excludeItemIds ?? []);
  const allowed = input.candidates.filter((c) => !excluded.has(c.itemId));
  return (
    pick(allowed, input, remainingNew) ??
    pick(input.candidates, input, remainingNew) ?? {
      ok: false,
      reason: 'NOTHING_DUE',
      nextDueAt: nextDue(input.candidates),
      remainingNew,
    }
  );
}

function pick(
  pool: readonly VocabCandidate[],
  input: VocabSelectInput,
  remainingNew: number,
): VocabSelection | null {
  const now = BigInt(Math.floor(input.nowMs));
  const due = (statuses: readonly FsrsCardStatus[]) =>
    pool
      .filter((c) => c.review && statuses.includes(c.review.cardStatus) && c.review.dueAt <= now)
      .sort(byDueAt)[0];

  const found = (c: VocabCandidate, reason: VocabSelectionReason): VocabSelection => ({
    ok: true,
    itemId: c.itemId,
    reason,
    mode: vocabModeFor(c.review),
    remainingNew,
  });

  const review = due(['REVIEW']);
  if (review) return found(review, 'REVIEW_DUE');
  const learning = due(['LEARNING', 'RELEARNING']);
  if (learning) return found(learning, 'LEARNING');
  if (remainingNew === 0) return null;

  const target = CEFR_RANK[input.targetLevel ?? 'A1'];
  const order = (c: VocabCandidate) => {
    const rank = CEFR_RANK[c.cefrLevel];
    return [Math.abs(rank - target), rank, seedFromString(`${input.seed}:${c.itemId}`)] as const;
  };
  const fresh = pool
    .filter((c) => c.review === null || c.review.cardStatus === 'NEW')
    .map((c) => ({ c, key: order(c) }))
    .sort((a, b) => compareKeys(a.key, b.key) || (a.c.itemId < b.c.itemId ? -1 : 1))[0];
  return fresh ? found(fresh.c, 'NEW') : null;
}

function byDueAt(a: VocabCandidate, b: VocabCandidate): number {
  const ad = a.review?.dueAt ?? 0n;
  const bd = b.review?.dueAt ?? 0n;
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function nextDue(candidates: readonly VocabCandidate[]): bigint | null {
  let next: bigint | null = null;
  for (const c of candidates) {
    if (c.review && c.review.cardStatus !== 'NEW' && (next === null || c.review.dueAt < next)) {
      next = c.review.dueAt;
    }
  }
  return next;
}
