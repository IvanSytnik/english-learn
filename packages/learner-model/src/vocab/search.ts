import { glossOf, normalizeAnswer } from './text';
import type { VocabLexeme, VocabLocale } from './types';

/**
 * Catalogue search of a list page's "Add words" box (B6.7, B6-SPEC §5):
 * a lemma or spelling-variant prefix, or a substring of the gloss in the
 * learner's language (the English definition for `en`). Pure; the caller
 * passes the PUBLISHED pool, so nothing else can be found.
 *
 * Order: exact headword or variant → headword prefix → variant prefix →
 * gloss substring; within a rank the more frequent word first (unknown
 * frequency last), then the slug — deterministic.
 */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_RESULTS = 20;
/** The longest query looked at; anything longer finds nothing. */
export const SEARCH_MAX_CHARS = 80;

export type SearchableWord = Pick<
  VocabLexeme,
  'lemma' | 'variants' | 'translations' | 'definitions'
> & {
  slug: string;
  frequencyRank: number | null;
};

/** English side: accents folded (`cafe` finds `café`). */
const foldEnglish = (text: string) =>
  normalizeAnswer(text).normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Combining acute: the stress mark some glosses carry (`за́мок`). */
const STRESS_MARK = String.fromCharCode(0x301);

/** Gloss side: stress marks dropped and ё read as е; other letters (й, ä) kept. */
const foldGloss = (text: string) =>
  normalizeAnswer(text)
    .normalize('NFD')
    .replaceAll(STRESS_MARK, '')
    .normalize('NFC')
    .replace(/ё/g, 'е');

type Keys = { lemma: string; variants: string[]; gloss: Partial<Record<VocabLocale, string>> };
const keyCache = new WeakMap<SearchableWord, Keys>();

function keysOf(
  word: SearchableWord,
  locale: VocabLocale,
): { lemma: string; variants: string[]; gloss: string } {
  let keys = keyCache.get(word);
  if (!keys) {
    keys = { lemma: foldEnglish(word.lemma), variants: word.variants.map(foldEnglish), gloss: {} };
    keyCache.set(word, keys);
  }
  let gloss = keys.gloss[locale];
  if (gloss === undefined) {
    gloss = foldGloss(glossOf(word, locale));
    keys.gloss[locale] = gloss;
  }
  return { lemma: keys.lemma, variants: keys.variants, gloss };
}

/** 0 exact, 1 headword prefix, 2 variant prefix, 3 gloss substring; null = no match. */
function rankOf(word: SearchableWord, locale: VocabLocale, english: string, gloss: string) {
  const keys = keysOf(word, locale);
  if (keys.lemma === english || keys.variants.includes(english)) return 0;
  if (keys.lemma.startsWith(english)) return 1;
  if (keys.variants.some((v) => v.startsWith(english))) return 2;
  if (gloss.length > 0 && keys.gloss.includes(gloss)) return 3;
  return null;
}

export function searchCatalogue<T extends SearchableWord>(
  words: readonly T[],
  query: string,
  locale: VocabLocale,
  limit: number = SEARCH_MAX_RESULTS,
): T[] {
  if (query.length > SEARCH_MAX_CHARS) return [];
  const english = foldEnglish(query);
  const gloss = foldGloss(query);
  if ([...english].length < SEARCH_MIN_CHARS && [...gloss].length < SEARCH_MIN_CHARS) return [];
  const hits: { word: T; rank: number }[] = [];
  for (const word of words) {
    const rank = rankOf(word, locale, english, gloss);
    if (rank !== null) hits.push({ word, rank });
  }
  const freq = (w: SearchableWord) => w.frequencyRank ?? Number.POSITIVE_INFINITY;
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      freq(a.word) - freq(b.word) ||
      (a.word.slug < b.word.slug ? -1 : a.word.slug > b.word.slug ? 1 : 0),
  );
  return hits.slice(0, Math.max(0, limit)).map((h) => h.word);
}
