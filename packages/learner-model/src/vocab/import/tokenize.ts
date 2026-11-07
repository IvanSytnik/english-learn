import { normalizeTerm } from './forms';

/**
 * The paste import's tokenizer (B6.7, B6-SPEC §5, V2-17). Pure and
 * catalogue-free: it turns pasted text into candidate terms; the matcher
 * decides what they are. The text itself is never kept anywhere.
 *
 * - A line is split on `,` and `;` first; then a piece's translation is cut
 *   at the first ` - ` (a hyphen WITH spaces), `–`, `—`, `:` or tab, keeping
 *   the left part. A hyphen inside a word never splits (`part-time`).
 * - A leading list marker (`1.`, `2)`, `-`, `•`) and bracketed notes
 *   (`(n.)`, `[informal]`) are dropped.
 * - NFC, lower case, straight apostrophes, punctuation trimmed per word;
 *   words without a Latin letter (a translation without a separator) are
 *   dropped, and a piece with none at all is counted as skipped.
 * - `bare` drops a leading `to` (verbs) and then a leading article;
 *   `toVerb` marks a `to` dropped before a word that is not an article
 *   (`to run`, not `to the park`): the matcher then prefers a verb (#39).
 * - Deduplicated by term; ≤ 200 candidates, the rest counted.
 */

export const PASTE_MAX_CHARS = 5000;
export const PASTE_MAX_CANDIDATES = 200;

export type PasteCandidate = {
  /** The piece as the learner wrote it, normalized (`to run`, `the dog`). */
  term: string;
  /** `term` without a leading `to` / article (`run`, `dog`). */
  bare: string;
  /** A leading `to` was dropped before a non-article: an infinitive, verbs first. */
  toVerb: boolean;
};

export type PasteTokens =
  | {
      ok: true;
      candidates: PasteCandidate[];
      /** Distinct candidates past the 200th. */
      notProcessed: number;
      /** Pieces with no Latin letter: translations, notes in another script. */
      skipped: number;
    }
  | { ok: false; error: 'TOO_LONG' | 'EMPTY' };

const PIECE_SPLIT = /[,;]/;
const TRANSLATION_CUT = / - |[–—:\t]/;
const LIST_MARKER = /^(?:\d{1,3}[.)]|[-*•·–—])\s+/;
const BRACKETED = /\([^)]*\)|\[[^\]]*\]/g;
const LATIN = /[a-z]/;
const ARTICLES = new Set(['a', 'an', 'the']);

function candidateOf(piece: string): PasteCandidate | 'skipped' | null {
  let text = piece.trim().replace(LIST_MARKER, '');
  const cut = text.search(TRANSLATION_CUT);
  if (cut >= 0) text = text.slice(0, cut);
  text = text.replace(BRACKETED, ' ');
  const normalized = normalizeTerm(text);
  if (normalized === '') return null;
  const words = normalized.split(' ').filter((w) => LATIN.test(w));
  if (words.length === 0) return 'skipped';
  const bare = [...words];
  if (bare[0] === 'to' && bare.length > 1) bare.shift();
  const toVerb = bare.length < words.length && !ARTICLES.has(bare[0] ?? '');
  if (ARTICLES.has(bare[0] ?? '') && bare.length > 1) bare.shift();
  return { term: words.join(' '), bare: bare.join(' '), toVerb };
}

export function tokenizePaste(text: string): PasteTokens {
  if (text.length > PASTE_MAX_CHARS) return { ok: false, error: 'TOO_LONG' };
  const seen = new Set<string>();
  const candidates: PasteCandidate[] = [];
  let notProcessed = 0;
  let skipped = 0;
  for (const line of text.normalize('NFC').split(/\r\n?|\n/)) {
    for (const piece of line.split(PIECE_SPLIT)) {
      const candidate = candidateOf(piece);
      if (candidate === null) continue;
      if (candidate === 'skipped') {
        skipped += 1;
        continue;
      }
      if (seen.has(candidate.term)) continue;
      seen.add(candidate.term);
      if (candidates.length < PASTE_MAX_CANDIDATES) candidates.push(candidate);
      else notProcessed += 1;
    }
  }
  if (candidates.length === 0 && skipped === 0) return { ok: false, error: 'EMPTY' };
  return { ok: true, candidates, notProcessed, skipped };
}
