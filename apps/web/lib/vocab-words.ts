import 'server-only';
import {
  clearLexemePreferences,
  setLexemePreferences,
} from '@englishlearn/db/queries/lexeme-preferences';
import type { VocabLexemeRow } from '@englishlearn/db/queries/vocab-lexemes';
import {
  type CefrLevelValue,
  type Locale,
  localized,
  MAX_PREFERENCE_BATCH,
  type PartOfSpeechValue,
} from '@englishlearn/db/schemas';
import { VOCAB_COLLECTION_TITLES, VocabCollectionValue } from '@englishlearn/db/vocab/collections';
import {
  getVocabTopic,
  parseVocabConceptId,
  VOCAB_TOPIC_IDS,
  vocabConceptId,
} from '@englishlearn/db/vocab/topics';
import {
  CEFR_RANK,
  glossOf,
  type StageBadge,
  stageBadge,
  type VocabLocale,
} from '@englishlearn/learner-model';
import type { VocabWordStates } from '@englishlearn/learner-model/service';
import { z } from 'zod';
import { meteredLimit } from '@/lib/auth/rate-limit';
import { vocabSessionService } from '@/lib/learner';
import type { Result } from '@/lib/result';
import { getVocabPool, type VocabPool } from '@/lib/vocab-pool';
import { learnerLocale } from '@/lib/vocab-session';

/**
 * The word pages (B6.6): every published word of a topic
 * (`/words/topics/[topic]`) or a curated collection
 * (`/words/collections/[key]`), grouped by level, with the learner's stage
 * badge and preference, and the preference writes behind their actions.
 *
 * Words are addressed by their public slug only (B6-SPEC §1, Axiom 3): no
 * Item or Lexeme id leaves the server. Stages are semantic badges, never an
 * FSRS number (Axiom 4). Preferences steer selection only — never an event,
 * never a projection.
 */

/** A word page: a topic (all its levels) or a curated collection. */
export const WordsPageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topic'), topic: z.enum(VOCAB_TOPIC_IDS) }).strict(),
  z.object({ kind: z.literal('collection'), key: VocabCollectionValue }).strict(),
]);
export type WordsPage = z.infer<typeof WordsPageSchema>;

/** Rows per page (`?page=`). */
export const WORDS_PAGE_SIZE = 100;

/** The learner-facing stage of a word (B6-SPEC V2-16): four badges, no numbers. */
export type WordBadge = StageBadge;

/** The badge of one word from the learner's states — the one rule every page uses. */
export const wordBadge = (states: VocabWordStates, itemId: string): WordBadge =>
  stageBadge({
    review: states.reviews.get(itemId) ?? null,
    proven: states.provenItemIds.has(itemId),
  });

export type WordPreference = 'PRIORITIZED' | 'HIDDEN' | null;

export type WordRowView = {
  /** The word's public address — the only handle its actions take. */
  slug: string;
  headword: string;
  pos: PartOfSpeechValue;
  level: CefrLevelValue;
  /** In the learner's language (native, else the interface's); English definition as fallback. */
  gloss: string;
  badge: WordBadge;
  preference: WordPreference;
};

export type WordLevelGroup = {
  level: CefrLevelValue;
  /** This page's rows of the level, in order. */
  words: WordRowView[];
  /**
   * Words of the level — on every page — that "Prioritize this level" would
   * prioritize: not started, not hidden, not prioritized yet.
   */
  prioritizable: number;
  /** The session this level's words are practised in (`/words/practice?…`). */
  practice: { concept: string } | { collection: VocabCollectionValue };
};

export type WordsPageView = {
  title: string;
  /** The language of the glosses (`lang` on them): the learner's, not always the UI's. */
  glossLang: VocabLocale;
  total: number;
  /** 1-based. */
  page: number;
  pageCount: number;
  groups: WordLevelGroup[];
};

const inPage = (row: VocabLexemeRow, page: WordsPage) =>
  page.kind === 'topic'
    ? parseVocabConceptId(row.conceptId)?.topic === page.topic
    : row.collections.includes(page.key);

/**
 * The page's words in their stable order: level, then frequency (unknown
 * last), then slug. Only words with a public slug — an ambiguous one is left
 * out of the pool's index (logged there) and could not be acted on.
 */
export function wordsOf(pool: VocabPool, page: WordsPage): VocabLexemeRow[] {
  return pool.lexemes
    .filter((row) => inPage(row, page) && pool.slugByItemId.has(row.itemId))
    .map((row) => ({ row, slug: pool.slugByItemId.get(row.itemId) ?? '' }))
    .sort(
      (a, b) =>
        CEFR_RANK[a.row.cefrLevel] - CEFR_RANK[b.row.cefrLevel] ||
        (a.row.frequencyRank ?? Number.POSITIVE_INFINITY) -
          (b.row.frequencyRank ?? Number.POSITIVE_INFINITY) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map(({ row }) => row);
}

const preferenceOf = (states: VocabWordStates, itemId: string): WordPreference =>
  states.hiddenItemIds.has(itemId)
    ? 'HIDDEN'
    : states.prioritizedItemIds.has(itemId)
      ? 'PRIORITIZED'
      : null;

/** What "Prioritize this level" takes: a word never answered, neither hidden nor prioritized. */
const isPrioritizable = (states: VocabWordStates, itemId: string) =>
  wordBadge(states, itemId) === 'not_started' && preferenceOf(states, itemId) === null;

const practiceOf = (page: WordsPage, level: CefrLevelValue): WordLevelGroup['practice'] =>
  page.kind === 'topic' ? { concept: vocabConceptId(page.topic, level) } : { collection: page.key };

export function pageTitle(page: WordsPage, uiLocale: Locale): string {
  return page.kind === 'topic'
    ? localized(getVocabTopic(page.topic).title, uiLocale)
    : localized(VOCAB_COLLECTION_TITLES[page.key], uiLocale);
}

/**
 * One page of a word page, or null when `pageNumber` is past the last page
 * (the route answers 404). An empty topic or collection is one empty page.
 */
export async function loadWordsPage(args: {
  userId: string;
  uiLocale: Locale;
  page: WordsPage;
  pageNumber: number;
}): Promise<WordsPageView | null> {
  const { page, pageNumber } = args;
  const [pool, states, locale] = await Promise.all([
    getVocabPool(),
    vocabSessionService.wordStates(args.userId),
    learnerLocale(args.userId, args.uiLocale),
  ]);
  const words = wordsOf(pool, page);
  const pageCount = Math.max(1, Math.ceil(words.length / WORDS_PAGE_SIZE));
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) return null;

  const prioritizable = new Map<CefrLevelValue, number>();
  for (const row of words) {
    if (isPrioritizable(states, row.itemId)) {
      prioritizable.set(row.cefrLevel, (prioritizable.get(row.cefrLevel) ?? 0) + 1);
    }
  }

  const groups: WordLevelGroup[] = [];
  const start = (pageNumber - 1) * WORDS_PAGE_SIZE;
  for (const row of words.slice(start, start + WORDS_PAGE_SIZE)) {
    let group = groups.at(-1);
    if (group?.level !== row.cefrLevel) {
      group = {
        level: row.cefrLevel,
        words: [],
        prioritizable: prioritizable.get(row.cefrLevel) ?? 0,
        practice: practiceOf(page, row.cefrLevel),
      };
      groups.push(group);
    }
    group.words.push({
      slug: pool.slugByItemId.get(row.itemId) ?? '',
      headword: row.lemma,
      pos: row.pos,
      level: row.cefrLevel,
      gloss: glossOf(row, locale),
      badge: wordBadge(states, row.itemId),
      preference: preferenceOf(states, row.itemId),
    });
  }

  return {
    title: pageTitle(page, args.uiLocale),
    glossLang: locale,
    total: words.length,
    page: pageNumber,
    pageCount,
    groups,
  };
}

export type WordPreferenceChange = 'prioritize' | 'unprioritize' | 'hide' | 'unhide';
export const WordPreferenceChangeSchema = z.enum(['prioritize', 'unprioritize', 'hide', 'unhide']);

export type WordPreferenceError = 'NOT_FOUND' | 'RATE_LIMITED';

export type PrioritizedLevel = {
  /** Rows written (a word unpublished meanwhile is skipped). */
  prioritized: number;
  /** Words of the level still to prioritize (beyond this call's 200). */
  remaining: number;
  /** The batch's words, by public slug. */
  slugs: string[];
};

const PREFERENCE_LIMIT = 'vocab-pref:user';

/**
 * Prioritize, hide, or undo either, for the word `slug` names. Charged to
 * the learner's `vocab-pref:user` budget (≤ 300 rows an hour) only when a
 * row actually changes (B6.7, #30): a repeat costs nothing. Setting a state
 * replaces the other one (prioritizing a hidden word unhides it); clearing
 * touches only its own state. An unknown, ambiguous or unpublished slug is
 * NOT_FOUND and costs nothing.
 */
export async function setWordPreference(args: {
  userId: string;
  slug: string;
  change: WordPreferenceChange;
}): Promise<Result<{ preference: WordPreference }, WordPreferenceError>> {
  const { userId, change } = args;
  const word = (await getVocabPool()).bySlug.get(args.slug);
  if (!word) return { ok: false, error: 'NOT_FOUND' };
  const lexemeIds = [word.id];
  const res = await meteredLimit(PREFERENCE_LIMIT, userId, async (tx) => {
    switch (change) {
      case 'prioritize':
      case 'hide': {
        const state = change === 'hide' ? 'HIDDEN' : 'PRIORITIZED';
        // PUBLISHED is re-checked in the statement: the pool may be a minute old.
        const { changed, notFound } = await setLexemePreferences(tx, { userId, lexemeIds, state });
        const value: WordPreference | 'NOT_FOUND' = notFound.length > 0 ? 'NOT_FOUND' : state;
        return { written: changed, value };
      }
      case 'unprioritize':
      case 'unhide': {
        const state = change === 'unhide' ? 'HIDDEN' : 'PRIORITIZED';
        const { cleared } = await clearLexemePreferences(tx, { userId, lexemeIds, state });
        return { written: cleared, value: null };
      }
      default: {
        const never: never = change;
        throw new Error(`Unknown preference change: ${String(never)}`);
      }
    }
  });
  if (!res.ok) return { ok: false, error: 'RATE_LIMITED' };
  if (res.value === 'NOT_FOUND') return { ok: false, error: 'NOT_FOUND' };
  return { ok: true, value: { preference: res.value } };
}

/**
 * "Prioritize this level": the page's words of `level` that are not started,
 * not hidden and not prioritized yet, at most MAX_PREFERENCE_BATCH (200) per
 * call in page order; `remaining` is what a next call would take. Charged
 * the rows actually written (B6.7, #30), all or nothing: a batch past the
 * `vocab-pref:user` budget writes and costs nothing. Hidden words stay
 * hidden; nothing to do costs nothing. `slugs` names the words of the batch,
 * so a page can mark exactly those rows.
 */
export async function prioritizeLevel(args: {
  userId: string;
  page: WordsPage;
  level: CefrLevelValue;
}): Promise<Result<PrioritizedLevel, WordPreferenceError>> {
  const { userId } = args;
  const [pool, states] = await Promise.all([
    getVocabPool(),
    vocabSessionService.wordStates(userId),
  ]);
  const eligible = wordsOf(pool, args.page).filter(
    (row) => row.cefrLevel === args.level && isPrioritizable(states, row.itemId),
  );
  const batch = eligible.slice(0, MAX_PREFERENCE_BATCH);
  if (batch.length === 0) return { ok: true, value: { prioritized: 0, remaining: 0, slugs: [] } };
  const res = await meteredLimit(PREFERENCE_LIMIT, userId, async (tx) => {
    const { changed } = await setLexemePreferences(tx, {
      userId,
      lexemeIds: batch.map((row) => row.id),
      state: 'PRIORITIZED',
    });
    return { written: changed, value: changed };
  });
  if (!res.ok) return { ok: false, error: 'RATE_LIMITED' };
  return {
    ok: true,
    value: {
      prioritized: res.value,
      remaining: eligible.length - batch.length,
      slugs: batch.map((row) => pool.slugByItemId.get(row.itemId) ?? ''),
    },
  };
}
