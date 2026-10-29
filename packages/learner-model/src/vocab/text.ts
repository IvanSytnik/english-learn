import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import type { VocabLexeme, VocabLocale } from './types';

/**
 * String helpers of the vocabulary engine. Pure; locale-independent except
 * where a locale is passed.
 */

/** Typed-answer key: NFC, curly apostrophes straightened, spaces collapsed, lower case. */
export function normalizeAnswer(text: string): string {
  return text.normalize('NFC').replace(/[‘’ʼ]/g, "'").trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The learner-side text of a word: its gloss in `locale`, or — for `en`, or a
 * lexeme without that gloss — its English definition.
 */
export function glossOf(lexeme: VocabLexeme, locale: VocabLocale): string {
  return (locale === 'en' ? undefined : lexeme.translations[locale]) ?? lexeme.definitions.en;
}

// Memo per lexeme object: a card compares the target with the whole pool.
const glossKeys = new WeakMap<VocabLexeme, Partial<Record<VocabLocale, string>>>();

/** Gloss comparison key: two words with equal keys are synonyms for this learner. */
export function glossKey(lexeme: VocabLexeme, locale: VocabLocale): string {
  const keys = glossKeys.get(lexeme) ?? {};
  const key = keys[locale] ?? normalizeAnswer(glossOf(lexeme, locale));
  keys[locale] = key;
  glossKeys.set(lexeme, keys);
  return key;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wholeWordRe = (word: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, 'iu');

/** `word` occurs in `text` as a whole word, case-insensitively (`Bank` in `die Bank`). */
export const containsWholeWord = (text: string, word: string) => wholeWordRe(word).test(text);

/**
 * The one whole-word occurrence of `target` in `sentence` (case-insensitive,
 * Unicode word boundaries — the same rule as LexemeExampleSchema), with the
 * article right before it when there is one (`an apple`).
 */
export function findClozeSpan(
  sentence: string,
  target: string,
): { start: number; end: number; article: { text: string; start: number } | null } {
  const m = wholeWordRe(target).exec(sentence);
  if (!m) throw new Error(`cloze target "${target}" is not in "${sentence}"`);
  const start = m.index;
  const art = /(?<![\p{L}\p{N}])(an?)\s+$/iu.exec(sentence.slice(0, start));
  return {
    start,
    end: start + m[0].length,
    article: art ? { text: art[1] ?? '', start: art.index } : null,
  };
}

// "an" before a vowel sound. Spelling is a proxy: a silent h takes "an",
// a "you"/"w" sound spelt with a vowel takes "a".
const AN_SILENT_H = /^(hour|honest|honou?r|heir)/i;
const A_BEFORE_VOWEL = /^(uni|use|usu|uti|ura|ure|euro|eu|one|once|ufo|ewe)/i;

/** The indefinite article for `word`: `a` or `an`. */
export function articleFor(word: string): 'a' | 'an' {
  if (AN_SILENT_H.test(word)) return 'an';
  if (A_BEFORE_VOWEL.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** `look up` -> `l___ u_`: each word's first character, letters after it blanked. */
export function recallCue(lemma: string): string {
  return lemma
    .split(' ')
    .map((word) =>
      [...word].map((ch, i) => (i === 0 || !/[\p{L}\p{N}]/u.test(ch) ? ch : '_')).join(''),
    )
    .join(' ');
}

/**
 * Inflection class of a surface form of a lemma, so a cloze offers choices in
 * the same form as the blank (`blew` against `walked`, never against `walk`).
 * Spelling heuristics, not morphology: an irregular verb form counts as past,
 * an irregular noun form as plural.
 */
export type SurfaceShape = 'base' | 'ing' | 's' | 'past' | 'plural' | 'er' | 'est' | 'other';

export function surfaceShape(form: string, lemmaKey: string, pos: PartOfSpeechValue): SurfaceShape {
  const f = normalizeAnswer(form);
  if (f === lemmaKey) return 'base';
  if (f.endsWith('ing') && !lemmaKey.endsWith('ing')) return 'ing';
  if (pos === 'VERB' || pos === 'PHRASAL_VERB') return f.endsWith('s') ? 's' : 'past';
  if (pos === 'NOUN') return 'plural';
  if (pos === 'ADJECTIVE' || pos === 'ADVERB') {
    if (f.endsWith('est')) return 'est';
    if (f.endsWith('er')) return 'er';
  }
  return 'other';
}

/** `form` with the first letter's case of `like` (sentence-initial `Ran` -> `Walked`). */
export function matchInitialCase(form: string, like: string): string {
  const first = like.charAt(0);
  if (first !== first.toUpperCase() || first === first.toLowerCase()) return form;
  return form.charAt(0).toUpperCase() + form.slice(1);
}
