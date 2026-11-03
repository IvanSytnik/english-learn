import { z } from 'zod';

/**
 * Browsing collections (B6.2): the CEFR-J Wordlist's `CoreInventory 1` and
 * `CoreInventory 2` columns, kept as snake_case tags on Lexeme.collections.
 *
 * A collection is a browsing tag, never a learner concept (B6-SPEC V2-6):
 * a word keeps its `Item.conceptId` (`vocab.<topic>.<level>`), whatever
 * collections it is in — moving items between concepts would break replay
 * equivalence, the payload carries `conceptId`.
 *
 * The key of a source label is derived by `collectionKeyOf` (lower-case
 * words, `and` / `of` / `the` / `in` / `vocab` dropped, a few spelling
 * aliases); the closed list below is what the data holds, so a new label in
 * a future source version fails the dataset test instead of inventing a key.
 */

export const VOCAB_COLLECTIONS = [
  'objects_rooms',
  'education',
  'work_jobs',
  'things_town_shops_shopping',
  'food_drink',
  'news_lifestyles_current_affairs',
  'travel_services',
  'hobbies_pastimes',
  'family_life',
  'nationalities_countries',
  'clothes',
  'shopping',
  'personal_information',
  'leisure_activities',
  'media',
  'ways_travelling',
  'books_literature',
  'collocation',
  'colours',
  'arts',
  'holidays',
  'scientific_development',
  'technical_legal_language',
  'film',
  'dimensions',
  'idiomatic_expressions',
  'adjectives_personality_description_feelings',
  'hobbies_lifestyles',
] as const;

export const VocabCollectionValue = z.enum(VOCAB_COLLECTIONS);
export type VocabCollectionValue = z.infer<typeof VocabCollectionValue>;

const STOP_WORDS = new Set(['and', 'of', 'the', 'in', 'vocab']);
/** Spelling variants inside the source (`Ways of traveling`, `Art`). */
const ALIASES: Readonly<Record<string, string>> = { traveling: 'travelling', art: 'arts' };

/** The snake_case key of a CoreInventory label: "Work and Jobs" → `work_jobs`. */
export function collectionKeyOf(label: string): string {
  const words = label
    .normalize('NFKD')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w !== '' && !STOP_WORDS.has(w))
    .map((w) => ALIASES[w] ?? w);
  if (words.length === 0) throw new Error(`Empty collection label: ${JSON.stringify(label)}`);
  return words.join('_');
}

/** Collections in the canonical order of VOCAB_COLLECTIONS, without duplicates. */
export function sortCollections(keys: Iterable<VocabCollectionValue>): VocabCollectionValue[] {
  const set = new Set(keys);
  return VOCAB_COLLECTIONS.filter((k) => set.has(k));
}
