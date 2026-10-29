import type { CefrLevelValue } from '../schemas/learner-events';
import type { LocalizedString } from '../schemas/localized-string';

/**
 * Vocabulary topics: the 14 topic areas of the Council of Europe Threshold
 * Level (the `Threshold` column of the CEFR-J Wordlist) plus `general` for
 * words that belong to no topic.
 *
 * A topic becomes one VOCAB Concept per level (`vocab.<topic>.<level>`): a
 * Concept has a single cefrLevel, and the level-aware selection ranks
 * concepts by it. The levels of one topic are linked by RELATED edges only —
 * a vocabulary concept is never a PREREQUISITE parent (V4).
 *
 * Topic ids are immutable once imported (they are part of Concept ids).
 */
export const VOCAB_TOPICS = [
  {
    id: 'personal_identification',
    threshold: 'Personal identification',
    title: { en: 'Personal information', ru: 'О себе', uk: 'Про себе', de: 'Persönliches' },
  },
  {
    id: 'house_home',
    threshold: 'House and home, environment',
    title: {
      en: 'Home and environment',
      ru: 'Дом и окружающая среда',
      uk: 'Дім і довкілля',
      de: 'Wohnen und Umwelt',
    },
  },
  {
    id: 'daily_life',
    threshold: 'Daily life',
    title: { en: 'Daily life', ru: 'Повседневная жизнь', uk: 'Повсякденне життя', de: 'Alltag' },
  },
  {
    id: 'free_time',
    threshold: 'Free time, entertainment',
    title: {
      en: 'Free time and entertainment',
      ru: 'Досуг и развлечения',
      uk: 'Дозвілля та розваги',
      de: 'Freizeit und Unterhaltung',
    },
  },
  {
    id: 'travel',
    threshold: 'Travel',
    title: { en: 'Travel', ru: 'Путешествия', uk: 'Подорожі', de: 'Reisen' },
  },
  {
    id: 'relations',
    threshold: 'Relations with other people',
    title: {
      en: 'People and relationships',
      ru: 'Люди и отношения',
      uk: 'Люди та стосунки',
      de: 'Menschen und Beziehungen',
    },
  },
  {
    id: 'health_body',
    threshold: 'Health and body care',
    title: {
      en: 'Health and body',
      ru: 'Здоровье и тело',
      uk: 'Здоровʼя та тіло',
      de: 'Gesundheit und Körper',
    },
  },
  {
    id: 'education',
    threshold: 'Education',
    title: { en: 'Education', ru: 'Образование', uk: 'Освіта', de: 'Bildung' },
  },
  {
    id: 'shopping',
    threshold: 'Shopping',
    title: { en: 'Shopping', ru: 'Покупки', uk: 'Покупки', de: 'Einkaufen' },
  },
  {
    id: 'food_drink',
    threshold: 'Food and drink',
    title: {
      en: 'Food and drink',
      ru: 'Еда и напитки',
      uk: 'Їжа та напої',
      de: 'Essen und Trinken',
    },
  },
  {
    id: 'services',
    threshold: 'Services',
    title: { en: 'Services', ru: 'Услуги', uk: 'Послуги', de: 'Dienstleistungen' },
  },
  {
    id: 'places',
    threshold: 'Places',
    title: { en: 'Places', ru: 'Места', uk: 'Місця', de: 'Orte' },
  },
  {
    id: 'weather',
    threshold: 'Weather',
    title: { en: 'Weather', ru: 'Погода', uk: 'Погода', de: 'Wetter' },
  },
  {
    id: 'language',
    threshold: 'Language',
    title: { en: 'Language', ru: 'Язык', uk: 'Мова', de: 'Sprache' },
  },
  {
    id: 'general',
    threshold: null,
    title: {
      en: 'Everyday words',
      ru: 'Общеупотребительные слова',
      uk: 'Загальновживані слова',
      de: 'Allgemeiner Wortschatz',
    },
  },
] as const satisfies readonly {
  id: string;
  threshold: string | null;
  title: Required<LocalizedString>;
}[];

export type VocabTopicId = (typeof VOCAB_TOPICS)[number]['id'];
export type VocabTopic = (typeof VOCAB_TOPICS)[number];

export const VOCAB_TOPIC_IDS = VOCAB_TOPICS.map((t) => t.id) as [VocabTopicId, ...VocabTopicId[]];

/** Words with no topic of their own. */
export const FALLBACK_TOPIC: VocabTopicId = 'general';

const byId = new Map<string, VocabTopic>(VOCAB_TOPICS.map((t) => [t.id, t]));

export function getVocabTopic(id: VocabTopicId): VocabTopic {
  const topic = byId.get(id);
  if (!topic) throw new Error(`Unknown vocabulary topic: ${id}`);
  return topic;
}

/**
 * The topic of a word: the topic id it carries, or FALLBACK_TOPIC when it has
 * none. An unknown id throws — a typo must not quietly move words into
 * `general`.
 */
export function resolveVocabTopic(topic: string | undefined): VocabTopicId {
  if (topic === undefined) return FALLBACK_TOPIC;
  const known = byId.get(topic);
  if (!known) throw new Error(`Unknown vocabulary topic: ${topic}`);
  return known.id;
}

/** The Concept of a topic at a level, e.g. `vocab.food_drink.a1`. */
export function vocabConceptId(
  topic: VocabTopicId,
  level: CefrLevelValue,
  prefix = 'vocab',
): string {
  return `${prefix}.${topic}.${level.toLowerCase()}`;
}
