import { z } from 'zod';
import type { LocalizedString } from '../schemas/localized-string';

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
 * aliases); COLLECTION_KEYS is what the data holds, so a new label in a
 * future source version fails the dataset test instead of inventing a key.
 *
 * Only the curated VOCAB_COLLECTIONS are shown on /words and accepted as a
 * session scope (B6.2a): linguistic categories (`collocation`,
 * `idiomatic_expressions`) and near-duplicates of the 15 topics
 * (`food_drink`, `education`, `shopping`, …) stay tags in the data — for
 * list import and future filters.
 */

/** Every key in the dataset, in the canonical order. */
export const COLLECTION_KEYS = [
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

export const CollectionKeyValue = z.enum(COLLECTION_KEYS);
export type CollectionKeyValue = z.infer<typeof CollectionKeyValue>;

/** The collections a learner can browse and practise, in /words order (B6.2a). */
export const VOCAB_COLLECTIONS = [
  'work_jobs',
  'news_lifestyles_current_affairs',
  'media',
  'clothes',
  'nationalities_countries',
  'books_literature',
] as const satisfies readonly CollectionKeyValue[];

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

/** Collections in the canonical order of COLLECTION_KEYS, without duplicates. */
export function sortCollections(keys: Iterable<CollectionKeyValue>): CollectionKeyValue[] {
  const set = new Set(keys);
  return COLLECTION_KEYS.filter((k) => set.has(k));
}

/**
 * Display titles (interface locale). ru/uk/de are assistant translations,
 * pending native review (HANDOFF §4).
 */
export const VOCAB_COLLECTION_TITLES: Readonly<Record<VocabCollectionValue, LocalizedString>> = {
  work_jobs: {
    en: 'Work and jobs',
    ru: 'Работа и профессии',
    uk: 'Робота й професії',
    de: 'Arbeit und Berufe',
  },
  news_lifestyles_current_affairs: {
    en: 'News, lifestyles and current affairs',
    ru: 'Новости, образ жизни, события',
    uk: 'Новини, спосіб життя, події',
    de: 'Nachrichten, Lebensstil, Aktuelles',
  },
  media: { en: 'Media', ru: 'СМИ', uk: 'ЗМІ', de: 'Medien' },
  clothes: { en: 'Clothes', ru: 'Одежда', uk: 'Одяг', de: 'Kleidung' },
  nationalities_countries: {
    en: 'Countries and nationalities',
    ru: 'Страны и национальности',
    uk: 'Країни й національності',
    de: 'Länder und Nationalitäten',
  },
  books_literature: {
    en: 'Books and literature',
    ru: 'Книги и литература',
    uk: 'Книжки й література',
    de: 'Bücher und Literatur',
  },
};
