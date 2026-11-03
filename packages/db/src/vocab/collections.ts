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

/** Words a collection needs before /words shows it as a card (tiny ones stay tags only). */
export const MIN_COLLECTION_WORDS = 10;

/**
 * Display titles (interface locale). ru/uk/de are assistant translations,
 * pending native review (HANDOFF §4).
 */
export const VOCAB_COLLECTION_TITLES: Readonly<Record<VocabCollectionValue, LocalizedString>> = {
  objects_rooms: {
    en: 'Objects and rooms',
    ru: 'Предметы и комнаты',
    uk: 'Предмети й кімнати',
    de: 'Gegenstände und Räume',
  },
  education: { en: 'Education', ru: 'Образование', uk: 'Освіта', de: 'Bildung' },
  work_jobs: {
    en: 'Work and jobs',
    ru: 'Работа и профессии',
    uk: 'Робота й професії',
    de: 'Arbeit und Berufe',
  },
  things_town_shops_shopping: {
    en: 'Around town and shops',
    ru: 'Город и магазины',
    uk: 'Місто й крамниці',
    de: 'Stadt und Geschäfte',
  },
  food_drink: {
    en: 'Food and drink',
    ru: 'Еда и напитки',
    uk: 'Їжа й напої',
    de: 'Essen und Trinken',
  },
  news_lifestyles_current_affairs: {
    en: 'News, lifestyles and current affairs',
    ru: 'Новости, образ жизни, события',
    uk: 'Новини, спосіб життя, події',
    de: 'Nachrichten, Lebensstil, Aktuelles',
  },
  travel_services: {
    en: 'Travel and services',
    ru: 'Путешествия и услуги',
    uk: 'Подорожі й послуги',
    de: 'Reisen und Dienstleistungen',
  },
  hobbies_pastimes: {
    en: 'Hobbies and pastimes',
    ru: 'Хобби и увлечения',
    uk: 'Хобі й захоплення',
    de: 'Hobbys und Zeitvertreib',
  },
  family_life: {
    en: 'Family life',
    ru: 'Семейная жизнь',
    uk: 'Сімейне життя',
    de: 'Familienleben',
  },
  nationalities_countries: {
    en: 'Countries and nationalities',
    ru: 'Страны и национальности',
    uk: 'Країни й національності',
    de: 'Länder und Nationalitäten',
  },
  clothes: { en: 'Clothes', ru: 'Одежда', uk: 'Одяг', de: 'Kleidung' },
  shopping: { en: 'Shopping', ru: 'Покупки', uk: 'Покупки', de: 'Einkaufen' },
  personal_information: {
    en: 'Personal information',
    ru: 'Личные данные',
    uk: 'Особисті дані',
    de: 'Angaben zur Person',
  },
  leisure_activities: {
    en: 'Leisure activities',
    ru: 'Досуг',
    uk: 'Дозвілля',
    de: 'Freizeitaktivitäten',
  },
  media: { en: 'Media', ru: 'СМИ', uk: 'ЗМІ', de: 'Medien' },
  ways_travelling: {
    en: 'Ways of travelling',
    ru: 'Способы передвижения',
    uk: 'Способи пересування',
    de: 'Unterwegs sein',
  },
  books_literature: {
    en: 'Books and literature',
    ru: 'Книги и литература',
    uk: 'Книжки й література',
    de: 'Bücher und Literatur',
  },
  collocation: {
    en: 'Collocations',
    ru: 'Устойчивые сочетания',
    uk: 'Сталі словосполучення',
    de: 'Kollokationen',
  },
  colours: { en: 'Colours', ru: 'Цвета', uk: 'Кольори', de: 'Farben' },
  arts: { en: 'Arts', ru: 'Искусство', uk: 'Мистецтво', de: 'Kunst' },
  holidays: {
    en: 'Holidays',
    ru: 'Отпуск и праздники',
    uk: 'Відпустка й свята',
    de: 'Urlaub und Feiertage',
  },
  scientific_development: {
    en: 'Science and progress',
    ru: 'Наука и прогресс',
    uk: 'Наука й прогрес',
    de: 'Wissenschaft und Fortschritt',
  },
  technical_legal_language: {
    en: 'Technical and legal language',
    ru: 'Техника и право',
    uk: 'Техніка й право',
    de: 'Technik und Recht',
  },
  film: { en: 'Film', ru: 'Кино', uk: 'Кіно', de: 'Film' },
  dimensions: { en: 'Dimensions', ru: 'Размеры', uk: 'Розміри', de: 'Maße' },
  idiomatic_expressions: { en: 'Idioms', ru: 'Идиомы', uk: 'Ідіоми', de: 'Redewendungen' },
  adjectives_personality_description_feelings: {
    en: 'Personality, description and feelings',
    ru: 'Характер, внешность, чувства',
    uk: 'Характер, зовнішність, почуття',
    de: 'Charakter, Aussehen, Gefühle',
  },
  hobbies_lifestyles: {
    en: 'Hobbies and lifestyles',
    ru: 'Хобби и образ жизни',
    uk: 'Хобі й спосіб життя',
    de: 'Hobbys und Lebensstil',
  },
};
