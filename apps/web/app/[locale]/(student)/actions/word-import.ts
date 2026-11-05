'use server';

import {
  isLocale,
  MAX_WORD_LIST_ENTRIES,
  WORD_LIST_TITLE_MAX,
  WordListIdSchema,
} from '@englishlearn/db/schemas';
import { LexemeSlugSchema } from '@englishlearn/db/vocab/slug';
import { PASTE_MAX_CHARS } from '@englishlearn/learner-model';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { authorizeAction } from '@/lib/authz';
import type { Result } from '@/lib/result';
import { confirmImport, type ImportPreviewView, previewImport } from '@/lib/vocab-import';
import type { AddedWords } from '@/lib/word-lists';
import type { WordListActionError } from './word-lists';

/**
 * Paste import actions (B6.7). V2-17: the pasted text is read in this
 * request and nowhere else — never stored, never logged (a failure logs the
 * error's name only: its message or stack could quote the input), never
 * sent to an LLM. The confirm step names words by slug only.
 */

export type ImportActionError = WordListActionError | 'TOO_LONG' | 'EMPTY';

const PreviewSchema = z
  .object({ text: z.string().max(PASTE_MAX_CHARS * 2), listId: WordListIdSchema.optional() })
  .strict();
const ConfirmSchema = z
  .object({
    slugs: z.array(LexemeSlugSchema).min(1).max(MAX_WORD_LIST_ENTRIES),
    listId: WordListIdSchema.optional(),
    title: z
      .string()
      .max(WORD_LIST_TITLE_MAX * 2)
      .optional(),
  })
  .strict()
  .refine((v) => (v.listId === undefined) !== (v.title === undefined));

/** Only the error's class name: never a message, stack or input. */
const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err);

/** Text → the three groups (matched · lemmatized · not found); nothing is written. */
export async function previewImportAction(
  input: z.input<typeof PreviewSchema>,
): Promise<Result<ImportPreviewView, ImportActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = PreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  try {
    const locale = await getLocale();
    return await previewImport({
      userId: user.value.id,
      uiLocale: isLocale(locale) ? locale : 'en',
      ...parsed.data,
    });
  } catch (err) {
    console.error('previewImport failed', errorName(err));
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** The chosen words into a list (`listId`) or a new list (`title`, source IMPORT). */
export async function confirmImportAction(
  input: z.input<typeof ConfirmSchema>,
): Promise<Result<{ listId: string } & AddedWords, ImportActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const { slugs, listId, title } = parsed.data;
  try {
    return await confirmImport({
      userId: user.value.id,
      slugs,
      target: listId !== undefined ? { listId } : { title: title ?? '' },
    });
  } catch (err) {
    console.error('confirmImport failed', errorName(err));
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
