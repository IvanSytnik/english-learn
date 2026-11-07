import { readFileSync } from 'node:fs';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { EXCLUDED_HEADWORDS } from '@englishlearn/db/vocab/excluded';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { normalizeTerm } from '../forms';
import { buildCatalogueIndex, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

/**
 * V2-18c (B6.7a): a function word the catalogue leaves out is never "not
 * found" — not alone, not inside a not-found term. Not-found terms are the
 * only material a later step may generate words from (B6.10), so this is the
 * guarantee that no function word ever reaches a generation payload.
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
const WORDS = [...new Set([...EXCLUDED_HEADWORDS].map(normalizeTerm))].filter((w) => w !== '');
const FUNCTION = new Set(WORDS);

function match(text: string) {
  const tokens = tokenizePaste(text);
  if (!tokens.ok) throw new Error(tokens.error);
  return matchCandidates(tokens.candidates, INDEX);
}
/** Not-found terms that are, or contain, a function word (as a word or a phrase). */
function leaks(text: string): string[] {
  return match(text).notFound.filter((term) => {
    const t = term.split(' ');
    return t.some((_, i) =>
      t.slice(i).some((__, j) => FUNCTION.has(t.slice(i, i + j + 1).join(' '))),
    );
  });
}

describe('function words never reach "not found" (V2-18c)', () => {
  it('each of the 80 excluded headwords: alone, in a list, after to / the, inside prose', () => {
    expect(WORDS.length).toBe(80);
    for (const w of WORDS) {
      for (const text of [
        w,
        `apple, ${w}, qwerty`,
        `to ${w}`,
        `the ${w}`,
        `${w} qwerty`,
        `I think ${w} zzyzx went home yesterday`,
      ]) {
        expect(leaks(text), text).toEqual([]);
      }
    }
  });

  it('every pair around an unknown word: the unknown word alone is not found', () => {
    for (const a of WORDS) {
      for (const b of WORDS) expect(leaks(`${a} qwerty ${b}`), `${a} qwerty ${b}`).toEqual([]);
    }
  });

  it('the ones the catalogue lacks are listed as function words, deduplicated, in order', () => {
    // A list entry's leading article is dropped by the tokenizer (`a brekfast`), not listed.
    const m = match('was, The, my qwerty, have to, was, a brekfast, they had');
    expect(m.functionWords).toEqual(['was', 'the', 'my', 'have to', 'had']);
    expect(m.notFound).toEqual(['qwerty', 'brekfast']);
  });

  it.each(['learner-list.txt', 'a2-prose.txt', 'messy-list.txt'])('the C5 text %s', (file) => {
    const text = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
    expect(leaks(text)).toEqual([]);
  });
});
