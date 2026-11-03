import type { FsrsCardStatus } from '../core/fsrs/types';
import { CEFR_RANK, type CEFRLevel } from '../core/graph/types';
import { seedFromString } from '../policy/rng';
import { vocabModeFor } from './ladder';
import type { VocabMode } from './types';

/**
 * The vocabulary session's next word (B2.5, selector v2 B6.2). Pure,
 * deterministic, its own pool — never the grammar candidates. Priority:
 *
 *   1. REVIEW_DUE — a word in review whose FSRS due moment has come, the
 *      most overdue first. **Global**: a scope never hides a due review;
 *   2. LEARNING   — a word in (re)learning whose short step is due. Global;
 *   3. NEW        — a never-answered word, while today's new words are under
 *      the learner's dailyVocabLimit. Only here do the scope, the hidden set
 *      and the priority set apply (B6-SPEC V2-5). Sort key:
 *      `[prioritized ? 0 : 1, |rank − target|, rank, frequencyRank ASC NULLS
 *      LAST, seedFromString(seed:itemId), itemId]` — the learner's level
 *      first (then the nearest levels, lower before higher; A1 without a
 *      level), frequent words first within a level, the day seed last.
 *      **Concept spread:** of the first CONCEPT_SPREAD_WINDOW by that key,
 *      the first whose concept is not among the last CONCEPT_SPREAD_RECENT
 *      served; none → the first.
 *
 * Otherwise NOTHING_DUE with the next due moment over the **global** set.
 * `excludeItemIds` (the words just shown) is ignored when it would leave
 * nothing to serve.
 */

/** NEW candidates the concept spread looks at. */
export const CONCEPT_SPREAD_WINDOW = 20;
/** How many of the latest served concepts the spread avoids. */
export const CONCEPT_SPREAD_RECENT = 3;

export type VocabCandidate = {
  itemId: string;
  /** Topic concept of the word (`vocab.<topic>.<level>`). */
  conceptId: string;
  cefrLevel: CEFRLevel;
  /** Lexeme.frequencyRank (1 = most frequent); null = unknown, sorts last. */
  frequencyRank: number | null;
  /** Lexeme.collections — browsing tags, never a concept. */
  collections: readonly string[];
  /** The learner's ItemReviewState; null = never answered. */
  review: {
    dueAt: bigint;
    cardStatus: FsrsCardStatus;
    stability: number;
    lastReviewAt: bigint | null;
  } | null;
};

/**
 * What a session is about. Filters the NEW tier only. A word list
 * (`{ kind: 'list' }`, B6.6) joins this union; `inScope` is exhaustive, so
 * the compiler points at the one place to extend.
 */
export type VocabScope =
  | { kind: 'concept'; conceptId: string }
  | { kind: 'collection'; key: string };

export type VocabSelectionReason = 'REVIEW_DUE' | 'LEARNING' | 'NEW';

export type VocabSelection =
  | {
      ok: true;
      itemId: string;
      reason: VocabSelectionReason;
      /** Ladder mode for the word's state (the card may fall back — see buildVocabCard). */
      mode: VocabMode;
      /**
       * The review state's lastReviewAt the choice was made on (null = never
       * answered): the card seed, and recordVocabOutcome's staleness check.
       */
      lastReviewAt: bigint | null;
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
  /** Restricts NEW words; reviews and learning steps stay global. */
  scope?: VocabScope;
  /** NEW words the learner put first (B6.6; empty until then). */
  priorityItemIds: ReadonlySet<string>;
  /** Words the learner hid: never introduced as NEW (B6.6; empty until then). */
  hiddenItemIds: ReadonlySet<string>;
  /** Concepts of the words served last, oldest first (the concept spread). */
  recentConceptIds: readonly string[];
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
    lastReviewAt: c.review?.lastReviewAt ?? null,
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
    return [
      input.priorityItemIds.has(c.itemId) ? 0 : 1,
      Math.abs(rank - target),
      rank,
      c.frequencyRank ?? Number.POSITIVE_INFINITY,
      seedFromString(`${input.seed}:${c.itemId}`),
    ] as const;
  };
  const ranked = pool
    .filter(
      (c) =>
        (c.review === null || c.review.cardStatus === 'NEW') &&
        !input.hiddenItemIds.has(c.itemId) &&
        inScope(c, input.scope),
    )
    .map((c) => ({ c, key: order(c) }))
    .sort((a, b) => compareKeys(a.key, b.key) || (a.c.itemId < b.c.itemId ? -1 : 1))
    .slice(0, CONCEPT_SPREAD_WINDOW)
    .map(({ c }) => c);
  const recent = new Set(input.recentConceptIds.slice(-CONCEPT_SPREAD_RECENT));
  const fresh = ranked.find((c) => !recent.has(c.conceptId)) ?? ranked[0];
  return fresh ? found(fresh, 'NEW') : null;
}

function inScope(c: VocabCandidate, scope: VocabScope | undefined): boolean {
  if (scope === undefined) return true;
  switch (scope.kind) {
    case 'concept':
      return c.conceptId === scope.conceptId;
    case 'collection':
      return c.collections.includes(scope.key);
    default: {
      const never: never = scope;
      throw new Error(`Unknown vocabulary scope: ${JSON.stringify(never)}`);
    }
  }
}

function byDueAt(a: VocabCandidate, b: VocabCandidate): number {
  const ad = a.review?.dueAt ?? 0n;
  const bd = b.review?.dueAt ?? 0n;
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
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
