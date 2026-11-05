import { z } from 'zod';

/**
 * Word preferences and word lists (B6.6, B6-SPEC §1). The Prisma enums are
 * canonical; these are their runtime twins. The length rules mirror the
 * raw-SQL CHECKs of migration 20261105120000_word_lists_preferences, so a
 * bad value is refused here before the database sees it. The counts are
 * enforced by the queries (queries/word-lists.ts), under a lock.
 */

export const LexemePreferenceStateSchema = z.enum(['PRIORITIZED', 'HIDDEN']);
export type LexemePreferenceStateValue = z.infer<typeof LexemePreferenceStateSchema>;

export const WordListSourceSchema = z.enum(['CUSTOM', 'IMPORT', 'TUTOR']);
export type WordListSourceValue = z.infer<typeof WordListSourceSchema>;

export const WORD_LIST_TITLE_MAX = 80;
export const WORD_LIST_NOTE_MAX = 200;
/** Active (not archived) lists per owner. */
export const MAX_ACTIVE_WORD_LISTS = 50;
export const MAX_WORD_LIST_ENTRIES = 500;
/** Words one preference call may write (bulk "Prioritize this level"). */
export const MAX_PREFERENCE_BATCH = 200;

/** Trimmed, 1..80 characters (CHECK `WordList_title_length`). */
export const WordListTitleSchema = z.string().trim().min(1).max(WORD_LIST_TITLE_MAX);

/** Trimmed, <= 200 characters; empty clears the note (CHECK `WordListEntry_note_length`). */
export const WordListNoteSchema = z
  .string()
  .trim()
  .max(WORD_LIST_NOTE_MAX)
  .transform((note) => (note.length === 0 ? null : note));

/** CHECK `WordListEntry_position_nonnegative`. */
export const WordListPositionSchema = z.number().int().min(0);
