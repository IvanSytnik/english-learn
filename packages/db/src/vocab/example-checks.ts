import type { CefrLevelValue } from '../schemas/learner-events';
import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * Sentence checks shared by the examples job (B6.4a, packages/ai) and the
 * spot check (vocab:sample --examples): word count, the normalized form two
 * sentences are compared by, where the cloze target sits, and the soft
 * "easy words" metric. Pure.
 */

/** Example sentences the examples job accepts, in words. */
export const EXAMPLE_MIN_WORDS = 6;
export const EXAMPLE_MAX_WORDS = 18;

const WORD = /[\p{L}\p{N}]/u;

/** Whitespace-separated tokens that hold a letter or a digit ("—" is not a word). */
export function exampleWords(sentence: string): string[] {
  return sentence.split(/\s+/u).filter((t) => WORD.test(t));
}

/** Lower case, NFKC, punctuation dropped, spaces collapsed: "Hi, Tom!" = "hi tom". */
export function normalizeSentence(sentence: string): string {
  return sentence
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

/**
 * Parts of speech that take endings (plural, past, -ing, comparative): for
 * them a new example must vary the form or the position of the word.
 */
export const INFLECTING_POS: ReadonlySet<PartOfSpeechValue> = new Set<PartOfSpeechValue>([
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'PHRASAL_VERB',
]);

export type TargetPosition = 'start' | 'middle' | 'end';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where the (first whole-word) cloze target sits: no word before it →
 * `start`, no word after it → `end`, else `middle`. Null when it is absent.
 */
export function targetPosition(sentence: string, target: string): TargetPosition | null {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(target)}(?![\\p{L}\\p{N}])`, 'iu');
  const match = pattern.exec(sentence);
  if (!match) return null;
  if (exampleWords(sentence.slice(0, match.index)).length === 0) return 'start';
  if (exampleWords(sentence.slice(match.index + match[0].length)).length === 0) return 'end';
  return 'middle';
}

const RANK: Readonly<Record<CefrLevelValue, number>> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** Candidate lemmas of a token: itself, then naive -s / -es / -ies / -ed / -ing / -er / -est stems. */
function stems(token: string): string[] {
  const out = [token];
  const add = (s: string) => s.length > 1 && out.push(s);
  if (token.endsWith('ies')) add(`${token.slice(0, -3)}y`);
  if (token.endsWith('es')) add(token.slice(0, -2));
  if (token.endsWith('s')) add(token.slice(0, -1));
  if (token.endsWith('ied')) add(`${token.slice(0, -3)}y`);
  if (token.endsWith('ed')) {
    add(token.slice(0, -2));
    add(token.slice(0, -1));
  }
  if (token.endsWith('ing')) {
    add(token.slice(0, -3));
    add(`${token.slice(0, -3)}e`);
  }
  if (token.endsWith('er')) add(token.slice(0, -2));
  if (token.endsWith('est')) add(token.slice(0, -3));
  return out;
}

/**
 * Soft metric (reported, never a gate): the share of a sentence's words the
 * catalogue places at most one level above the word's own. A token counts
 * when it, or a naive stem of it, is a catalogue lemma at that level;
 * numbers count; unknown words (names, irregular forms) do not.
 */
export function easyWordShare(
  sentence: string,
  wordLevel: CefrLevelValue,
  levelOf: (lemmaKey: string) => CefrLevelValue | undefined,
): number {
  const words = exampleWords(sentence);
  if (words.length === 0) return 0;
  const limit = RANK[wordLevel] + 1;
  let easy = 0;
  for (const raw of words) {
    const token = raw
      .toLowerCase()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .replace(/'s$/u, '');
    if (/^\p{N}+$/u.test(token)) {
      easy += 1;
      continue;
    }
    const level = stems(token)
      .map(levelOf)
      .find((l) => l !== undefined);
    if (level !== undefined && RANK[level] <= limit) easy += 1;
  }
  return easy / words.length;
}
