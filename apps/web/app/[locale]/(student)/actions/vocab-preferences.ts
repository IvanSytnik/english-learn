'use server';

import { CefrLevelValue } from '@englishlearn/db/schemas';
import { LexemeSlugSchema } from '@englishlearn/db/vocab/slug';
import { z } from 'zod';
import { authorizeAction } from '@/lib/authz';
import type { Result } from '@/lib/result';
import {
  prioritizeLevel,
  setWordPreference,
  type WordPreference,
  WordPreferenceChangeSchema,
  WordsPageSchema,
} from '@/lib/vocab-words';

/**
 * The word pages' preference actions (B6.6): prioritize / unprioritize /
 * hide / unhide one word, and "Prioritize this level". Learners only (S5).
 * A word is named by its public slug, never an Item or Lexeme id (Axiom 3).
 * Every write counts against the learner's `vocab-pref:user` budget
 * (≤ 300 an hour; a bulk of n words costs n).
 */

export type WordPreferenceActionError =
  | 'UNAUTHENTICATED'
  /** Signed in, but not a learner. */
  | 'FORBIDDEN'
  | 'INVALID'
  /** Unknown, ambiguous or unpublished slug. */
  | 'NOT_FOUND'
  /** Over the hourly preference budget: nothing was written. */
  | 'RATE_LIMITED'
  /** Something failed on the server; the cause is in the server log. */
  | 'UNAVAILABLE';

const PreferenceSchema = z
  .object({ slug: LexemeSlugSchema, change: WordPreferenceChangeSchema })
  .strict();

const LevelSchema = z.object({ page: WordsPageSchema, level: CefrLevelValue }).strict();

async function guarded<T>(
  name: string,
  run: () => Promise<Result<T, WordPreferenceActionError>>,
): Promise<Result<T, WordPreferenceActionError>> {
  try {
    return await run();
  } catch (err) {
    console.error(`${name} failed`, err);
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** One word's preference; returns the state the word is left in. */
export async function setWordPreferenceAction(
  input: z.input<typeof PreferenceSchema>,
): Promise<Result<{ preference: WordPreference }, WordPreferenceActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = PreferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  return guarded('setWordPreference', () =>
    setWordPreference({ userId: user.value.id, ...parsed.data }),
  );
}

/** "Prioritize this level" on a topic or collection page (≤ 200 words a call). */
export async function prioritizeLevelAction(
  input: z.input<typeof LevelSchema>,
): Promise<Result<{ prioritized: number; remaining: number }, WordPreferenceActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = LevelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  return guarded('prioritizeLevel', () =>
    prioritizeLevel({ userId: user.value.id, ...parsed.data }),
  );
}
