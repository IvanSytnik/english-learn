import { isClosedClass } from '@englishlearn/db/vocab/closed-class';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { isShadowedLexeme } from '@englishlearn/db/vocab/excluded';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { buildCatalogueIndex, matchCandidates } from '../match';
import { PASTE_NO_PRESELECT, PASTE_NO_PRESELECT_ENTRIES } from '../no-preselect';
import { tokenizePaste } from '../tokenize';

/**
 * #40 (B6.7b, V2-19) over the real catalogue: a homograph of a function word
 * is offered, never preselected — an entry flagged `shadowedByExcludedPos`
 * (`can` noun, `May`) or listed in PASTE_NO_PRESELECT (`IT`).
 */

const { lexemes } = loadCefrJDataset();
const { bySlug } = slugIndex(lexemes);
const INDEX = buildCatalogueIndex(
  [...bySlug].map(([slug, l]) => ({
    slug,
    lemma: l.lemma,
    lemmaKey: l.lemmaKey,
    pos: l.pos,
    variants: l.variants,
    frequencyRank: null,
  })),
);

function entries(text: string) {
  const tokens = tokenizePaste(text);
  if (!tokens.ok) throw new Error(tokens.error);
  const m = matchCandidates(tokens.candidates, INDEX);
  return { m, all: [...m.matched, ...m.lemmatized] };
}
const word = (slug: string) => {
  const l = bySlug.get(slug);
  if (!l) throw new Error(slug);
  return l;
};

describe('PASTE_NO_PRESELECT (V2-19 #40)', () => {
  it('every entry is a catalogue word, open-class and not flagged (the rules cover those), once', () => {
    const slugs = PASTE_NO_PRESELECT_ENTRIES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThan(0);
    for (const e of PASTE_NO_PRESELECT_ENTRIES) {
      const l = bySlug.get(e.slug);
      expect(l, `${e.slug} is not in the catalogue`).toBeDefined();
      if (!l) continue;
      expect(l.lemma).toBe(e.lemma);
      expect(isClosedClass(l), e.slug).toBe(false);
      expect(l.shadowedByExcludedPos, e.slug).toBeUndefined();
    }
  });

  it('it, may, can: nothing preselected, the catalogue words still offered; will is a function word', () => {
    const { m } = entries('it, may, can, will');
    expect(m.matched.map((e) => [e.term, e.preselected, e.slugs])).toEqual([
      ['it', null, ['it-noun', 'it-pronoun']],
      ['may', null, ['may-noun']],
      ['can', null, ['can-noun']],
    ]);
    expect(m.functionWords).toEqual(['will']);
  });

  it('each of the 58 flagged entries is offered unchecked when its lemma is pasted', () => {
    const flagged = [...bySlug].filter(([, l]) => l.shadowedByExcludedPos === true);
    expect(flagged.length).toBe(58);
    for (const [slug, l] of flagged) {
      const offered = entries(l.lemma).all.find((e) => e.slugs.includes(slug));
      expect(offered, slug).toBeDefined();
      expect(offered?.preselected, slug).not.toBe(slug);
    }
  });

  it('each listed entry is offered unchecked when its lemma is pasted', () => {
    for (const slug of PASTE_NO_PRESELECT) {
      const offered = entries(word(slug).lemma).all.find((e) => e.slugs.includes(slug));
      expect(offered, slug).toBeDefined();
      expect(offered?.preselected, slug).not.toBe(slug);
    }
  });

  it('pasting any catalogue lemma never preselects a closed-class, flagged or listed word', () => {
    const bad: string[] = [];
    for (const [, l] of bySlug) {
      for (const e of entries(l.lemma).all) {
        if (e.preselected === null) continue;
        const p = word(e.preselected);
        if (isClosedClass(p) || isShadowedLexeme(p) || PASTE_NO_PRESELECT.has(e.preselected)) {
          bad.push(`${l.lemma} → ${e.preselected}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
