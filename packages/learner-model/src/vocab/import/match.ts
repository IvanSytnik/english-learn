import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import { isClosedClass } from '@englishlearn/db/vocab/closed-class';
import { irregularForms, normalizeTerm, regularForms } from './forms';
import { PASTE_MAX_CANDIDATES, type PasteCandidate } from './tokenize';

/**
 * The paste import's reverse-form matcher (B6.7, B6-SPEC §5). Pure: the
 * caller builds the index once from the PUBLISHED catalogue and matches
 * candidates against it. Words are named by slug only.
 *
 * Order: the whole term → the term without `to` / article → inside the
 * term, longest window first (≤ 4 words: `bus stop` before `bus`). A key is
 * looked up as a lemma or spelling variant (exact) and as a generated form
 * (regular rules, WordNet exceptions). An exact hit beats the regular forms
 * of other lemmas (`building` is the noun, not `build`); irregular forms
 * still compete (`left` → left / leave, `saw` → saw / see).
 *
 * Groups: matched = exact hits only, the primary (best frequency rank)
 * preselected. Lemmatized = any hit through a form: preselected is the
 * primary exact hit if there is one, else the primary when every hit is the
 * same lemma (`went` → go, `works` → work), else nothing (the learner picks).
 * After a dropped `to` the primary is a verb when there is one (`to run` →
 * run verb, #39). A closed-class word (closed POS or function adverb) is
 * never preselected (#33): offered unchecked, the learner may still tick it
 * (`to`, `and`, `next to`; `like` preselects the verb, not the preposition).
 */

export const MULTIWORD_MAX_TOKENS = 4;

export type CatalogueWord = {
  slug: string;
  lemma: string;
  /** Lexeme.lemmaKey: the closed-class check (FUNCTION_ADVERBS). */
  lemmaKey: string;
  pos: PartOfSpeechValue;
  variants: readonly string[];
  frequencyRank: number | null;
};

type Via = 'exact' | 'form' | 'irregular';
type Hit = { word: CatalogueWord; via: Via };

export type CatalogueIndex = {
  exact: ReadonlyMap<string, readonly CatalogueWord[]>;
  forms: ReadonlyMap<string, readonly Hit[]>;
};

export type ImportEntry = {
  /** The pasted term (or the window of it) that matched. */
  term: string;
  group: 'matched' | 'lemmatized';
  /** Candidate words: the preselected one first, then exact hits, by frequency. */
  slugs: string[];
  preselected: string | null;
};

export type ImportMatch = {
  matched: ImportEntry[];
  lemmatized: ImportEntry[];
  /** Shown to the learner only; never stored (V2-17). */
  notFound: string[];
  /** Distinct results past the limit. */
  notProcessed: number;
};

function push<V>(map: Map<string, V[]>, key: string, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildCatalogueIndex(words: readonly CatalogueWord[]): CatalogueIndex {
  const exact = new Map<string, CatalogueWord[]>();
  const forms = new Map<string, Hit[]>();
  for (const word of words) {
    const spellings = [...new Set([word.lemma, ...word.variants].map(normalizeTerm))];
    for (const key of spellings) push(exact, key, word);
    for (const spelling of spellings) {
      const regular = new Set(regularForms(spelling, word.pos));
      for (const form of regular) push(forms, form, { word, via: 'form' });
      for (const form of irregularForms(spelling, word.pos)) {
        if (!regular.has(form)) push(forms, form, { word, via: 'irregular' });
      }
    }
  }
  return { exact, forms };
}

const rank = (w: CatalogueWord) => w.frequencyRank ?? Number.POSITIVE_INFINITY;
const byFrequency = (a: CatalogueWord, b: CatalogueWord) =>
  rank(a) - rank(b) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
const VERB_POS: ReadonlySet<PartOfSpeechValue> = new Set(['VERB', 'PHRASAL_VERB']);

type Prefer = { verb: boolean };

/**
 * The word to preselect: the best open-class word by frequency; with `verb`,
 * the best verb when there is one. Null when every word is closed-class.
 */
function primary(all: readonly CatalogueWord[], prefer: Prefer): CatalogueWord | null {
  const words = all.filter((w) => !isClosedClass(w));
  const verbs = prefer.verb ? words.filter((w) => VERB_POS.has(w.pos)) : [];
  return [...(verbs.length > 0 ? verbs : words)].sort(byFrequency)[0] ?? null;
}

function lookup(
  index: CatalogueIndex,
  key: string,
  prefer: Prefer = { verb: false },
): ImportEntry | null {
  const exact = index.exact.get(key) ?? [];
  const lemmas = new Set(exact.map((w) => normalizeTerm(w.lemma)));
  const slugs = new Set(exact.map((w) => w.slug));
  const formHits = (index.forms.get(key) ?? []).filter(
    (h) =>
      !slugs.has(h.word.slug) &&
      (exact.length === 0 || (h.via === 'irregular' && !lemmas.has(normalizeTerm(h.word.lemma)))),
  );
  const others = [...new Map(formHits.map((h) => [h.word.slug, h.word])).values()];
  if (exact.length === 0 && others.length === 0) return null;
  const all = [...exact, ...others];
  const sameLemma = new Set(all.map((w) => normalizeTerm(w.lemma))).size === 1;
  const chosen =
    exact.length > 0 ? primary(exact, prefer) : sameLemma ? primary(others, prefer) : null;
  const ordered = [...[...exact].sort(byFrequency), ...others.sort(byFrequency)];
  const rest = ordered.filter((w) => w !== chosen).map((w) => w.slug);
  return {
    term: key,
    group: others.length === 0 ? 'matched' : 'lemmatized',
    slugs: chosen ? [chosen.slug, ...rest] : rest,
    preselected: chosen?.slug ?? null,
  };
}

/** One candidate: its entries, and what of it was not found. */
function matchOne(index: CatalogueIndex, c: PasteCandidate) {
  const whole =
    lookup(index, c.term) ?? (c.bare !== c.term ? lookup(index, c.bare, { verb: c.toVerb }) : null);
  if (whole) return { entries: [whole], notFound: [] };
  const tokens = c.bare.split(' ');
  const entries: ImportEntry[] = [];
  const missing: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    let step = 0;
    for (let n = Math.min(MULTIWORD_MAX_TOKENS, tokens.length - i); n >= 1 && step === 0; n--) {
      const hit = lookup(index, tokens.slice(i, i + n).join(' '));
      if (hit) {
        entries.push(hit);
        step = n;
      }
    }
    if (step === 0) {
      const token = tokens[i] ?? '';
      if (!['a', 'an', 'the'].includes(token)) missing.push(token);
      step = 1;
    }
    i += step;
  }
  // Nothing of a short term found: it is one unknown term (`ice cream`), not its words.
  if (entries.length === 0 && missing.length > 0 && tokens.length <= MULTIWORD_MAX_TOKENS) {
    return { entries, notFound: [c.bare] };
  }
  return { entries, notFound: missing };
}

export function matchCandidates(
  candidates: readonly PasteCandidate[],
  index: CatalogueIndex,
  limit: number = PASTE_MAX_CANDIDATES,
): ImportMatch {
  const entries: ImportEntry[] = [];
  const bySlugs = new Map<string, number>();
  const notFound = new Set<string>();
  let notProcessed = 0;
  const full = () => entries.length + notFound.size >= limit;
  for (const candidate of candidates) {
    const res = matchOne(index, candidate);
    for (const entry of res.entries) {
      const key = [...entry.slugs].sort().join(' ');
      const at = bySlugs.get(key);
      if (at !== undefined) {
        // The same words twice (`apples`, `apple`): one entry, matched if either is.
        if (entry.group === 'matched' && entries[at]?.group === 'lemmatized') entries[at] = entry;
        continue;
      }
      if (full()) notProcessed += 1;
      else bySlugs.set(key, entries.push(entry) - 1);
    }
    for (const term of res.notFound) {
      if (notFound.has(term)) continue;
      if (full()) notProcessed += 1;
      else notFound.add(term);
    }
  }
  return {
    matched: entries.filter((e) => e.group === 'matched'),
    lemmatized: entries.filter((e) => e.group === 'lemmatized'),
    notFound: [...notFound],
    notProcessed,
  };
}
