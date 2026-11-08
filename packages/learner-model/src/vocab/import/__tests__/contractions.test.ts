import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { EXCLUDED_HEADWORDS } from '@englishlearn/db/vocab/excluded';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { CONTRACTIONS } from '../contractions';
import { normalizeTerm } from '../forms';
import { buildCatalogueIndex, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

/**
 * The contraction table (B6.7b, V2-19 #41) over the real catalogue: every
 * contraction is made of function words, and pasted it lands in the
 * function-words group — after the catalogue, which keeps `o'clock`.
 */

const { lexemes } = loadCefrJDataset();
const INDEX = buildCatalogueIndex(
  [...slugIndex(lexemes).bySlug].map(([slug, l]) => ({
    slug,
    lemma: l.lemma,
    lemmaKey: l.lemmaKey,
    pos: l.pos,
    variants: l.variants,
    frequencyRank: null,
  })),
);
const FUNCTION = new Set([...EXCLUDED_HEADWORDS].map(normalizeTerm));
const CATALOGUE_KEYS = new Set(lexemes.map((l) => l.lemmaKey));
const SPELLINGS = new Set(lexemes.flatMap((l) => [l.lemma, ...l.variants].map(normalizeTerm)));

function match(text: string) {
  const tokens = tokenizePaste(text);
  if (!tokens.ok) throw new Error(tokens.error);
  return matchCandidates(tokens.candidates, INDEX);
}

/** B6.7b step 3.1: the minimum the table must hold. */
const MINIMUM = [
  "i'm",
  "you're",
  "he's",
  "she's",
  "it's",
  "we're",
  "they're",
  "i've",
  "i'll",
  "i'd",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "won't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "haven't",
  "hasn't",
  "couldn't",
  "wouldn't",
  "shouldn't",
  "let's",
  "that's",
  "there's",
  "what's",
];

describe('the contraction table (V2-19 #41)', () => {
  it('holds the minimum, 49 entries in all, sorted', () => {
    for (const c of MINIMUM) expect(CONTRACTIONS.has(c), c).toBe(true);
    expect(CONTRACTIONS.size).toBe(49);
    const keys = [...CONTRACTIONS.keys()];
    expect(keys).toEqual([...keys].sort());
  });

  it('each one stands for function words or catalogue words only', () => {
    for (const [c, words] of CONTRACTIONS) {
      for (const w of words) {
        expect(FUNCTION.has(w) || CATALOGUE_KEYS.has(w), `${c}: ${w}`).toBe(true);
      }
    }
  });

  it('keys are normalized like pasted text, and none is a catalogue spelling (it would win)', () => {
    for (const c of CONTRACTIONS.keys()) {
      expect(normalizeTerm(c)).toBe(c);
      expect(c).not.toContain(' ');
      expect(SPELLINGS.has(c), c).toBe(false);
    }
  });

  it('each one pasted alone, curly or straight, is a function word', () => {
    for (const c of CONTRACTIONS.keys()) {
      for (const text of [c, c.toUpperCase(), c.replace("'", '’')]) {
        expect(match(text), text).toMatchObject({
          matched: [],
          lemmatized: [],
          functionWords: [c],
          notFound: [],
        });
      }
    }
  });

  it('the catalogue comes first: o’clock and driver’s license stay words', () => {
    const m = match('o’clock, driver’s license, don’t');
    expect(m.matched.map((e) => [e.term, e.preselected])).toEqual([
      ["o'clock", 'oclock-adverb'],
      ["driver's license", 'drivers-license-noun'],
    ]);
    expect(m.functionWords).toEqual(["don't"]);
  });

  it('inside prose: the contractions and the function words are one group, as pasted', () => {
    const m = match("I'm sure it's fine, and they'll say we can't");
    expect(m.functionWords).toEqual(["i'm", "it's", "they'll", "can't"]);
    expect(m.notFound).toEqual([]);
  });

  it('a space inside a contraction is no contraction; a lone apostrophe is nothing', () => {
    expect(match("don 't")).toMatchObject({ functionWords: [], notFound: ['don t'] });
    expect(tokenizePaste("'")).toEqual({ ok: false, error: 'EMPTY' });
    expect(match("apple, ', ' ', it ' s")).toMatchObject({
      matched: [
        expect.objectContaining({ term: 'apple' }),
        expect.objectContaining({ term: 'it' }),
      ],
      functionWords: ['s'],
      notFound: [],
    });
  });
});
