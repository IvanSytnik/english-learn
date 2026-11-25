import 'server-only';
import type { CefrLevelValue, Locale, PartOfSpeechValue } from '@englishlearn/db/schemas';
import { localized } from '@englishlearn/db/schemas';
import { VOCAB_COLLECTION_TITLES, VocabCollectionValue } from '@englishlearn/db/vocab/collections';
import { LexemeSlugSchema } from '@englishlearn/db/vocab/slug';
import {
  getVocabTopic,
  parseVocabConceptId,
  type VocabTopicId,
} from '@englishlearn/db/vocab/topics';
import { glossOf, type VocabLocale } from '@englishlearn/learner-model';
import { vocabSessionService } from '@/lib/learner';
import { getVocabPool } from '@/lib/vocab-pool';
import { learnerLocale } from '@/lib/vocab-session';
import { preferenceOf, type WordBadge, type WordPreference, wordBadge } from '@/lib/vocab-words';

/**
 * The word page (B6.8, `/words/w/[slug]`): one published word with its IPA,
 * definition, examples and collocations, where it lives (topic, collections)
 * and the learner's own state — stage badge, preference, next review.
 *
 * Addressed by the public slug only (Axiom 3): an unknown, malformed or
 * ambiguous slug is null (the route answers 404, never a guess — B6-SPEC §5
 * guardrail), and no Item or Lexeme id leaves the server. Reads the PUBLISHED
 * pool only. The stage is a badge and the review a whole number of days,
 * never an FSRS number (Axiom 4).
 */

const DAY_MS = 86_400_000;

/**
 * When the word comes back: never practised (`none`), due now, later today
 * (a learning step), or in whole days (rounded up: "in 1 day" until it is due).
 */
export type WordReview =
  | { kind: 'none' }
  | { kind: 'due' }
  | { kind: 'today' }
  | { kind: 'inDays'; days: number };

export type WordPageView = {
  slug: string;
  headword: string;
  pos: PartOfSpeechValue;
  level: CefrLevelValue;
  ipa: string | null;
  /** In the learner's language (native, else the interface's); English definition as fallback. */
  gloss: string;
  /** The language of the gloss and the example translations (`lang`). */
  glossLang: VocabLocale;
  /** The English definition, or null when the gloss already is it. */
  definition: string | null;
  examples: { sentence: string; translation: string | null }[];
  collocations: string[];
  /** The topic page the word is listed on, or null for a word outside the taxonomy. */
  topic: { id: VocabTopicId; title: string } | null;
  /** The browsable collections that list the word, in /words order. */
  collections: { key: VocabCollectionValue; title: string }[];
  badge: WordBadge;
  preference: WordPreference;
  review: WordReview;
  /** The session scope "I know" opens the proof in: the word's topic level. */
  practice: { concept: string } | null;
};

export function wordReview(
  review: { dueAt: bigint } | null | undefined,
  nowMs: number,
): WordReview {
  if (!review) return { kind: 'none' };
  const left = Number(review.dueAt) - nowMs;
  if (left <= 0) return { kind: 'due' };
  if (left < DAY_MS) return { kind: 'today' };
  return { kind: 'inDays', days: Math.ceil(left / DAY_MS) };
}

/** The word `slug` names, as its page shows it to this learner — or null (404). */
export async function loadWordPage(args: {
  userId: string;
  uiLocale: Locale;
  slug: string;
  nowMs?: number;
}): Promise<WordPageView | null> {
  const slug = LexemeSlugSchema.safeParse(args.slug);
  if (!slug.success) return null;
  const pool = await getVocabPool();
  const row = pool.bySlug.get(slug.data);
  if (!row) return null;
  const [states, locale] = await Promise.all([
    vocabSessionService.wordStates(args.userId),
    learnerLocale(args.userId, args.uiLocale),
  ]);
  const nowMs = args.nowMs ?? Date.now();

  const gloss = glossOf(row, locale);
  const concept = parseVocabConceptId(row.conceptId);
  const collections = VocabCollectionValue.options
    .filter((key) => row.collections.includes(key))
    .map((key) => ({ key, title: localized(VOCAB_COLLECTION_TITLES[key], args.uiLocale) }));

  return {
    slug: slug.data,
    headword: row.lemma,
    pos: row.pos,
    level: row.cefrLevel,
    ipa: row.ipa,
    gloss,
    glossLang: locale,
    definition: row.definitions.en === gloss ? null : row.definitions.en,
    examples: row.examples.map((ex) => ({
      sentence: ex.sentence,
      translation: locale === 'en' ? null : (ex.translation[locale] ?? null),
    })),
    collocations: [...row.collocations],
    topic: concept
      ? { id: concept.topic, title: localized(getVocabTopic(concept.topic).title, args.uiLocale) }
      : null,
    collections,
    badge: wordBadge(states, row.itemId),
    preference: preferenceOf(states, row.itemId),
    review: wordReview(states.reviews.get(row.itemId), nowMs),
    practice: concept ? { concept: row.conceptId } : null,
  };
}
