'use server';

import {
  isLocale,
  WORD_LIST_NOTE_MAX,
  WORD_LIST_TITLE_MAX,
  WordListIdSchema,
} from '@englishlearn/db/schemas';
import { LexemeSlugSchema } from '@englishlearn/db/vocab/slug';
import { SEARCH_MAX_CHARS } from '@englishlearn/learner-model';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { authorizeAction } from '@/lib/authz';
import type { Result } from '@/lib/result';
import {
  type AddedWords,
  addWords,
  archiveList,
  createList,
  type ListError,
  type ListMenuView,
  listMenu,
  moveWord,
  removeWord,
  renameList,
  restoreList,
  searchWords,
  setNote,
  type WordSearchResult,
} from '@/lib/word-lists';

/**
 * Word list actions (B6.7): create, rename, archive, restore, add, remove,
 * note, move, catalogue search and the "Add to list…" menu. Learners only
 * (S5). A list is named by its id — owner-checked on every call, another
 * learner's id is NOT_FOUND — and a word by its public slug only (Axiom 3).
 * Writes are metered by rows written (`vocab-list:user`, ≤ 1000 an hour).
 */

export type WordListActionError =
  | 'UNAUTHENTICATED'
  /** Signed in, but not a learner. */
  | 'FORBIDDEN'
  | 'INVALID'
  /** Not the learner's list (or archived, for a change), or an unknown word. */
  | 'NOT_FOUND'
  /** 50 active lists or 500 words in a list: nothing was written. */
  | 'LIMIT'
  /** Over the hourly budget: nothing was written. */
  | 'RATE_LIMITED'
  /** Something failed on the server; the cause is in the server log. */
  | 'UNAVAILABLE';

type ActionResult<T> = Result<T, WordListActionError>;

/** The search box and the menu add one word at a time; a little room for a later bulk. */
const MAX_SLUGS_PER_ADD = 20;

const ListId = WordListIdSchema;
const Title = z.string().max(WORD_LIST_TITLE_MAX * 2);

const CreateSchema = z
  .object({ title: Title, slugs: z.array(LexemeSlugSchema).max(MAX_SLUGS_PER_ADD).optional() })
  .strict();
const ListSchema = z.object({ listId: ListId }).strict();
const RenameSchema = z.object({ listId: ListId, title: Title }).strict();
const AddSchema = z
  .object({ listId: ListId, slugs: z.array(LexemeSlugSchema).min(1).max(MAX_SLUGS_PER_ADD) })
  .strict();
const WordSchema = z.object({ listId: ListId, slug: LexemeSlugSchema }).strict();
const NoteSchema = z
  .object({ listId: ListId, slug: LexemeSlugSchema, note: z.string().max(WORD_LIST_NOTE_MAX * 2) })
  .strict();
const MoveSchema = z
  .object({
    listId: ListId,
    slug: LexemeSlugSchema,
    anchor: z.union([
      z.object({ before: LexemeSlugSchema }).strict(),
      z.object({ after: LexemeSlugSchema }).strict(),
    ]),
  })
  .strict();
const SearchSchema = z
  .object({ query: z.string().max(SEARCH_MAX_CHARS), listId: ListId.optional() })
  .strict();
const MenuSchema = z.object({ slug: LexemeSlugSchema }).strict();

async function run<S extends z.ZodType, T>(
  name: string,
  schema: S,
  input: unknown,
  body: (userId: string, data: z.infer<S>) => Promise<Result<T, ListError>>,
): Promise<ActionResult<T>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  try {
    return await body(user.value.id, parsed.data);
  } catch (err) {
    console.error(`${name} failed`, err);
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

const uiLocale = async () => {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'en';
};

/** A new list (title 1..80); with `slugs`, its first words (the "Add to list…" menu). */
export async function createWordListAction(
  input: z.input<typeof CreateSchema>,
): Promise<ActionResult<{ id: string; title: string } & AddedWords>> {
  return run('createWordList', CreateSchema, input, (userId, { title, slugs }) =>
    createList({ userId, title, slugs }),
  );
}

export async function renameWordListAction(
  input: z.input<typeof RenameSchema>,
): Promise<ActionResult<{ title: string }>> {
  return run('renameWordList', RenameSchema, input, (userId, data) =>
    renameList({ userId, ...data }),
  );
}

export async function archiveWordListAction(
  input: z.input<typeof ListSchema>,
): Promise<ActionResult<{ archived: true }>> {
  return run('archiveWordList', ListSchema, input, async (userId, data) => {
    const res = await archiveList({ userId, ...data });
    return res.ok ? { ok: true, value: { archived: true as const } } : res;
  });
}

export async function restoreWordListAction(
  input: z.input<typeof ListSchema>,
): Promise<ActionResult<{ restored: true }>> {
  return run('restoreWordList', ListSchema, input, async (userId, data) => {
    const res = await restoreList({ userId, ...data });
    return res.ok ? { ok: true, value: { restored: true as const } } : res;
  });
}

/** Add words by slug; a word already in the list is skipped and counted. */
export async function addWordsToListAction(
  input: z.input<typeof AddSchema>,
): Promise<ActionResult<AddedWords>> {
  return run('addWordsToList', AddSchema, input, (userId, data) => addWords({ userId, ...data }));
}

export async function removeWordFromListAction(
  input: z.input<typeof WordSchema>,
): Promise<ActionResult<{ removed: true }>> {
  return run('removeWordFromList', WordSchema, input, (userId, data) =>
    removeWord({ userId, ...data }),
  );
}

/** Set (≤ 200 characters) or clear (empty) a word's note. */
export async function setWordListNoteAction(
  input: z.input<typeof NoteSchema>,
): Promise<ActionResult<{ note: string | null }>> {
  return run('setWordListNote', NoteSchema, input, (userId, data) => setNote({ userId, ...data }));
}

/** Move a word right before or after another word of the list (drag, keyboard up / down). */
export async function moveWordInListAction(
  input: z.input<typeof MoveSchema>,
): Promise<ActionResult<{ moved: boolean }>> {
  return run('moveWordInList', MoveSchema, input, (userId, data) => moveWord({ userId, ...data }));
}

/** Catalogue search (≥ 2 characters, ≤ 20 results, PUBLISHED only); 1 of `vocab-search:user` a query. */
export async function searchWordsAction(
  input: z.input<typeof SearchSchema>,
): Promise<ActionResult<{ results: WordSearchResult[] }>> {
  return run('searchWords', SearchSchema, input, async (userId, data) => {
    const res = await searchWords({ userId, uiLocale: await uiLocale(), ...data });
    return res.ok ? { ok: true, value: { results: res.value } } : res;
  });
}

/** The "Add to list…" menu of one word: active lists, marked when they already hold it. */
export async function wordListMenuAction(
  input: z.input<typeof MenuSchema>,
): Promise<ActionResult<ListMenuView>> {
  return run('wordListMenu', MenuSchema, input, (userId, data) => listMenu({ userId, ...data }));
}
