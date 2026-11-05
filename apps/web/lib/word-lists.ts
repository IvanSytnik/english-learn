import 'server-only';
import { prisma } from '@englishlearn/db';
import type { VocabLexemeRow } from '@englishlearn/db/queries/vocab-lexemes';
import {
  addWordListEntries,
  archiveWordList,
  createWordList,
  getWordList,
  listWordLists,
  moveWordListEntry,
  removeWordListEntry,
  renameWordList,
  restoreWordList,
  setWordListEntryNote,
  type WordListError,
  type WordListResult,
} from '@englishlearn/db/queries/word-lists';
import {
  type CefrLevelValue,
  type Locale,
  MAX_ACTIVE_WORD_LISTS,
  MAX_WORD_LIST_ENTRIES,
  type PartOfSpeechValue,
  type WordListSourceValue,
} from '@englishlearn/db/schemas';
import {
  glossOf,
  STAGE_BADGES,
  type StageBadge,
  searchCatalogue,
  type VocabLocale,
} from '@englishlearn/learner-model';
import type { VocabWordStates } from '@englishlearn/learner-model/service';
import { meteredLimit, withinAuthLimits } from '@/lib/auth/rate-limit';
import { vocabSessionService } from '@/lib/learner';
import type { Result } from '@/lib/result';
import { getVocabPool, type VocabPool } from '@/lib/vocab-pool';
import { learnerLocale } from '@/lib/vocab-session';
import { type WordBadge, wordBadge } from '@/lib/vocab-words';

/**
 * A learner's word lists (B6.7, B6-SPEC §5): the lists index, one list's
 * page, catalogue search, and every list write.
 *
 * List ids may reach the client — a list is the learner's own resource and
 * every read and write names its owner, so another learner's id is NOT_FOUND
 * (404), never FORBIDDEN. Words are addressed by public slug only (Axiom 3):
 * no Item or Lexeme id leaves this module. Badges are the shared V2-16 rule.
 *
 * Every write is metered (`vocab-list:user`, ≤ 1000 rows an hour): it runs in
 * the transaction that charges it and costs the rows it actually wrote.
 */

export const LIST_PAGE_SIZE = 100;
const LIST_LIMIT = 'vocab-list:user';

export type ListError = WordListError | 'RATE_LIMITED';
export type StageSummary = Record<StageBadge, number>;

export type WordListCardView = {
  id: string;
  title: string;
  /** Words the learner can see (published); the list may hold more. */
  count: number;
  /** ISO: formatted on the client in the learner's locale. */
  updatedAt: string;
  archivedAt: string | null;
  stages: StageSummary;
};

export type WordListsIndexView = {
  active: WordListCardView[];
  archived: WordListCardView[];
  maxActive: number;
};

export type WordListRowView = {
  slug: string;
  headword: string;
  pos: PartOfSpeechValue;
  level: CefrLevelValue;
  gloss: string;
  badge: WordBadge;
  note: string | null;
};

export type WordListPageView = {
  id: string;
  title: string;
  source: WordListSourceValue;
  archived: boolean;
  glossLang: VocabLocale;
  total: number;
  /** 1-based. */
  page: number;
  pageCount: number;
  /** Words before this page: a row's place in the list is offset + index + 1. */
  offset: number;
  rows: WordListRowView[];
  /** The word just before this page and just after it: keyboard moves across a page edge. */
  prevSlug: string | null;
  nextSlug: string | null;
  /** Entries whose word is no longer published: kept in the list, not shown. */
  unavailable: number;
  capacity: number;
};

export type WordSearchResult = {
  slug: string;
  headword: string;
  pos: PartOfSpeechValue;
  level: CefrLevelValue;
  gloss: string;
  inList: boolean;
};

const emptyStages = (): StageSummary =>
  Object.fromEntries(STAGE_BADGES.map((b) => [b, 0])) as StageSummary;

/** The pool's words of a list, in list order (unpublished ones dropped). */
function wordsOfList(pool: VocabPool, lexemeIds: readonly string[]): VocabLexemeRow[] {
  return lexemeIds.flatMap((id) => {
    const itemId = pool.itemIdByLexemeId.get(id);
    const row = itemId === undefined ? undefined : pool.byItemId.get(itemId);
    return row && pool.slugByItemId.has(row.itemId) ? [row] : [];
  });
}

const slugOf = (pool: VocabPool, row: VocabLexemeRow) => pool.slugByItemId.get(row.itemId) ?? '';

function stagesOf(words: readonly VocabLexemeRow[], states: VocabWordStates): StageSummary {
  const stages = emptyStages();
  for (const row of words) stages[wordBadge(states, row.itemId)] += 1;
  return stages;
}

export async function loadWordListsIndex(userId: string): Promise<WordListsIndexView> {
  const lists = await listWordLists(prisma, userId);
  const view: WordListsIndexView = { active: [], archived: [], maxActive: MAX_ACTIVE_WORD_LISTS };
  if (lists.length === 0) return view;
  const [pool, states] = await Promise.all([
    getVocabPool(),
    vocabSessionService.wordStates(userId),
  ]);
  for (const list of lists) {
    const words = wordsOfList(pool, list.lexemeIds);
    const card: WordListCardView = {
      id: list.id,
      title: list.title,
      count: words.length,
      updatedAt: list.updatedAt.toISOString(),
      archivedAt: list.archivedAt?.toISOString() ?? null,
      stages: stagesOf(words, states),
    };
    (list.archivedAt === null ? view.active : view.archived).push(card);
  }
  return view;
}

/**
 * Whether the learner may practise this list: theirs and active. Anything
 * else is a 404 on `/words/practice?list=` — never a 403 (B6-SPEC Axiom 3).
 */
export async function ownsActiveList(userId: string, listId: string): Promise<boolean> {
  const list = await getWordList(prisma, { ownerId: userId, listId });
  return list.ok && list.value.archivedAt === null;
}

/**
 * One page of a list, or null — another learner's or unknown list, or a page
 * past the last (the route answers 404). An empty list is one empty page.
 */
export async function loadWordListPage(args: {
  userId: string;
  uiLocale: Locale;
  listId: string;
  pageNumber: number;
}): Promise<WordListPageView | null> {
  const list = await getWordList(prisma, { ownerId: args.userId, listId: args.listId });
  if (!list.ok) return null;
  const [pool, states, locale] = await Promise.all([
    getVocabPool(),
    vocabSessionService.wordStates(args.userId),
    learnerLocale(args.userId, args.uiLocale),
  ]);
  const words = wordsOfList(
    pool,
    list.value.entries.map((e) => e.lexemeId),
  );
  const pageCount = Math.max(1, Math.ceil(words.length / LIST_PAGE_SIZE));
  const { pageNumber } = args;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) return null;
  const notes = new Map(list.value.entries.map((e) => [e.lexemeId, e.note]));
  const start = (pageNumber - 1) * LIST_PAGE_SIZE;
  const neighbour = (i: number) => {
    const row = words[i];
    return row ? slugOf(pool, row) : null;
  };
  return {
    id: list.value.id,
    title: list.value.title,
    source: list.value.source,
    archived: list.value.archivedAt !== null,
    glossLang: locale,
    total: words.length,
    page: pageNumber,
    pageCount,
    offset: start,
    rows: words.slice(start, start + LIST_PAGE_SIZE).map((row) => ({
      slug: slugOf(pool, row),
      headword: row.lemma,
      pos: row.pos,
      level: row.cefrLevel,
      gloss: glossOf(row, locale),
      badge: wordBadge(states, row.itemId),
      note: notes.get(row.id) ?? null,
    })),
    prevSlug: neighbour(start - 1),
    nextSlug: neighbour(start + LIST_PAGE_SIZE),
    unavailable: list.value.entries.length - words.length,
    capacity: MAX_WORD_LIST_ENTRIES,
  };
}

/** A list write's result as rows written; a refused write wrote nothing. */
const writtenBy = <T>(res: WordListResult<T>, rows: (value: T) => number) =>
  res.ok ? rows(res.value) : 0;

/** Run one metered list write; past the budget nothing is written and nothing charged. */
async function metered<T>(
  userId: string,
  write: (tx: Parameters<Parameters<typeof meteredLimit>[2]>[0]) => Promise<WordListResult<T>>,
  rows: (value: T) => number,
): Promise<Result<T, ListError>> {
  const res = await meteredLimit(LIST_LIMIT, userId, async (tx) => {
    const value = await write(tx);
    return { written: writtenBy(value, rows), value };
  });
  if (!res.ok) return { ok: false, error: 'RATE_LIMITED' };
  return res.value.ok
    ? { ok: true, value: res.value.value }
    : { ok: false, error: res.value.error };
}

/** Slugs → lexeme ids of the pool, in order; unknown or ambiguous slugs counted, not guessed. */
function lexemesOf(pool: VocabPool, slugs: readonly string[]) {
  const ids: string[] = [];
  let unknown = 0;
  for (const slug of new Set(slugs)) {
    const row = pool.bySlug.get(slug);
    if (row) ids.push(row.id);
    else unknown += 1;
  }
  return { ids, unknown };
}

export type AddedWords = { added: number; alreadyIn: number; notFound: number; didNotFit: number };

/**
 * A new list; with `slugs`, its first words in the same transaction (the
 * "Add to list…" menu's "New list", paste import's "New list from text").
 */
export async function createList(args: {
  userId: string;
  title: string;
  slugs?: readonly string[];
  source?: WordListSourceValue;
  overflow?: 'reject' | 'fit';
}): Promise<Result<{ id: string; title: string } & AddedWords, ListError>> {
  const pool = args.slugs?.length ? await getVocabPool() : null;
  const { ids, unknown } = pool ? lexemesOf(pool, args.slugs ?? []) : { ids: [], unknown: 0 };
  return metered(
    args.userId,
    async (tx) => {
      const made = await createWordList(tx, {
        ownerId: args.userId,
        title: args.title,
        source: args.source,
      });
      if (!made.ok || ids.length === 0) {
        return made.ok
          ? {
              ok: true,
              value: { ...made.value, added: 0, alreadyIn: 0, notFound: unknown, didNotFit: 0 },
            }
          : made;
      }
      const added = await addWordListEntries(tx, {
        ownerId: args.userId,
        listId: made.value.id,
        lexemeIds: ids,
        overflow: args.overflow,
      });
      if (!added.ok) return added;
      return {
        ok: true,
        value: {
          ...made.value,
          added: added.value.added,
          alreadyIn: added.value.alreadyIn,
          notFound: added.value.notFound.length + unknown,
          didNotFit: added.value.didNotFit,
        },
      };
    },
    (v) => 1 + v.added,
  );
}

export function renameList(args: { userId: string; listId: string; title: string }) {
  return metered(
    args.userId,
    (tx) => renameWordList(tx, { ownerId: args.userId, listId: args.listId, title: args.title }),
    () => 1,
  );
}

export function archiveList(args: { userId: string; listId: string }) {
  return metered(
    args.userId,
    (tx) => archiveWordList(tx, { ownerId: args.userId, listId: args.listId }),
    (v) => Number(v.changed),
  );
}

export function restoreList(args: { userId: string; listId: string }) {
  return metered(
    args.userId,
    (tx) => restoreWordList(tx, { ownerId: args.userId, listId: args.listId }),
    (v) => Number(v.changed),
  );
}

/** Append words by slug (search "Add", the "Add to list…" menu, paste import). */
export async function addWords(args: {
  userId: string;
  listId: string;
  slugs: readonly string[];
  overflow?: 'reject' | 'fit';
}): Promise<Result<AddedWords, ListError>> {
  const { ids, unknown } = lexemesOf(await getVocabPool(), args.slugs);
  return metered(
    args.userId,
    async (tx) => {
      const res = await addWordListEntries(tx, {
        ownerId: args.userId,
        listId: args.listId,
        lexemeIds: ids,
        overflow: args.overflow,
      });
      return res.ok
        ? {
            ok: true,
            value: {
              added: res.value.added,
              alreadyIn: res.value.alreadyIn,
              notFound: res.value.notFound.length + unknown,
              didNotFit: res.value.didNotFit,
            },
          }
        : res;
    },
    (v) => v.added,
  );
}

/** One word of the list by slug; an unknown slug is NOT_FOUND before any write. */
async function lexemeOf(slug: string): Promise<string | null> {
  return (await getVocabPool()).bySlug.get(slug)?.id ?? null;
}

export async function removeWord(args: { userId: string; listId: string; slug: string }) {
  const lexemeId = await lexemeOf(args.slug);
  if (!lexemeId) return { ok: false, error: 'NOT_FOUND' } as const;
  return metered(
    args.userId,
    (tx) => removeWordListEntry(tx, { ownerId: args.userId, listId: args.listId, lexemeId }),
    () => 1,
  );
}

export async function setNote(args: {
  userId: string;
  listId: string;
  slug: string;
  note: string;
}) {
  const lexemeId = await lexemeOf(args.slug);
  if (!lexemeId) return { ok: false, error: 'NOT_FOUND' } as const;
  return metered(
    args.userId,
    (tx) =>
      setWordListEntryNote(tx, {
        ownerId: args.userId,
        listId: args.listId,
        lexemeId,
        note: args.note,
      }),
    () => 1,
  );
}

export type SlugAnchor = { before: string } | { after: string };

export async function moveWord(args: {
  userId: string;
  listId: string;
  slug: string;
  anchor: SlugAnchor;
}) {
  const pool = await getVocabPool();
  const lexemeId = pool.bySlug.get(args.slug)?.id;
  const anchorSlug = 'before' in args.anchor ? args.anchor.before : args.anchor.after;
  const anchorId = pool.bySlug.get(anchorSlug)?.id;
  if (!lexemeId || !anchorId) return { ok: false, error: 'NOT_FOUND' } as const;
  const anchor = 'before' in args.anchor ? { before: anchorId } : { after: anchorId };
  return metered(
    args.userId,
    (tx) => moveWordListEntry(tx, { ownerId: args.userId, listId: args.listId, lexemeId, anchor }),
    (v) => Number(v.moved),
  );
}

/** One catalogue read (a search query, a paste preview) against the hourly budget. */
export const withinSearchBudget = (userId: string) =>
  withinAuthLimits([['vocab-search:user', userId]]);

/**
 * Catalogue search for a list's "Add words" box: PUBLISHED words only (the
 * pool), ≤ 20, each marked when it is already in the list. NOT_FOUND for a
 * list that is not the learner's; RATE_LIMITED past `vocab-search:user`.
 */
export async function searchWords(args: {
  userId: string;
  uiLocale: Locale;
  query: string;
  listId?: string;
}): Promise<Result<WordSearchResult[], 'NOT_FOUND' | 'RATE_LIMITED'>> {
  if (!(await withinSearchBudget(args.userId))) return { ok: false, error: 'RATE_LIMITED' };
  const [pool, locale, list] = await Promise.all([
    getVocabPool(),
    learnerLocale(args.userId, args.uiLocale),
    args.listId === undefined
      ? Promise.resolve(null)
      : getWordList(prisma, { ownerId: args.userId, listId: args.listId }),
  ]);
  if (list && !list.ok) return { ok: false, error: 'NOT_FOUND' };
  const inList = new Set(list?.ok ? list.value.entries.map((e) => e.lexemeId) : []);
  const words = pool.lexemes.flatMap((row) => {
    const slug = pool.slugByItemId.get(row.itemId);
    return slug === undefined ? [] : [{ ...row, slug }];
  });
  const hits = searchCatalogue(words, args.query, locale);
  return {
    ok: true,
    value: hits.map((row) => ({
      slug: row.slug,
      headword: row.lemma,
      pos: row.pos,
      level: row.cefrLevel,
      gloss: glossOf(row, locale),
      inList: inList.has(row.id),
    })),
  };
}

export type ListMenuView = {
  lists: { id: string; title: string; count: number; hasWord: boolean }[];
  /** 50 active lists: "New list" is not offered. */
  atLimit: boolean;
};

/** The "Add to list…" menu of one word: the learner's active lists, marked when they hold it. */
export async function listMenu(args: {
  userId: string;
  slug: string;
}): Promise<Result<ListMenuView, 'NOT_FOUND'>> {
  const [pool, lists] = await Promise.all([getVocabPool(), listWordLists(prisma, args.userId)]);
  const word = pool.bySlug.get(args.slug);
  if (!word) return { ok: false, error: 'NOT_FOUND' };
  const active = lists.filter((l) => l.archivedAt === null);
  return {
    ok: true,
    value: {
      lists: active.map((l) => ({
        id: l.id,
        title: l.title,
        count: l.lexemeIds.length,
        hasWord: l.lexemeIds.includes(word.id),
      })),
      atLimit: active.length >= MAX_ACTIVE_WORD_LISTS,
    },
  };
}
