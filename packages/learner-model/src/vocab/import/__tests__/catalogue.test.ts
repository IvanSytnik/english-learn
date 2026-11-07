import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import DATA from '../../../../data/irregular-forms.json';
import { IRREGULAR_ROWS, normalizeTerm, regularForms } from '../forms';
import { buildCatalogueIndex, type CatalogueWord, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

/**
 * The matcher over the real catalogue (the CEFR-J dataset, A1–B1) and the committed
 * WordNet exception data: every lemma, variant, generated form and table row
 * finds its way back.
 */

const { lexemes } = loadCefrJDataset();
const { bySlug } = slugIndex(lexemes);
const WORDS: CatalogueWord[] = [...bySlug].map(([slug, l]) => ({
  slug,
  lemma: l.lemma,
  lemmaKey: l.lemmaKey,
  pos: l.pos,
  variants: l.variants,
  frequencyRank: null,
}));
const INDEX = buildCatalogueIndex(WORDS);

/** The slugs a pasted text offers, in every group. */
function offered(text: string): Set<string> {
  const tokens = tokenizePaste(text);
  if (!tokens.ok) return new Set();
  const m = matchCandidates(tokens.candidates, INDEX);
  return new Set([...m.matched, ...m.lemmatized].flatMap((e) => e.slugs));
}

describe('the committed exception data', () => {
  it('carries its source, licence and counts', () => {
    expect(DATA.source.copyright).toBe(
      'WordNet 3.0 Copyright 2006 by Princeton University.  All rights reserved.',
    );
    expect(DATA.source.licenceText).toContain('THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS"');
    expect(DATA.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DATA.filter.minZipf).toBe(2.5);
    for (const table of ['verb', 'noun', 'adj'] as const) {
      expect(DATA.counts[table]).toBe(IRREGULAR_ROWS[table].length);
      for (const [form, base] of IRREGULAR_ROWS[table]) {
        expect(form).not.toBe(base);
        expect(form).toBe(normalizeTerm(form ?? ''));
      }
    }
  });

  it('covers the A1–B1 irregular verbs', () => {
    const bases = new Set(IRREGULAR_ROWS.verb.map(([, base]) => base));
    const core =
      'begin break bring build buy catch choose come drink drive eat fall feel fight find fly forget give go grow hear hide hold keep know leave lose make meet pay ride run say see sell send sing sit sleep speak spend stand swim take teach tell think throw understand wear win write';
    expect(core.split(' ').filter((v) => !bases.has(v))).toEqual([]);
  });

  it('every row leads back to its base (unless the form is a catalogue word of its own)', () => {
    const misses: string[] = [];
    for (const [table, pos] of [
      ['verb', 'VERB'],
      ['noun', 'NOUN'],
      ['adj', 'ADJECTIVE'],
    ] as const) {
      for (const [form = '', base = ''] of IRREGULAR_ROWS[table]) {
        const slugs = WORDS.filter(
          (w) => w.pos === pos && [w.lemma, ...w.variants].map(normalizeTerm).includes(base),
        ).map((w) => w.slug);
        const got = offered(form);
        if (!slugs.some((s) => got.has(s)) && !INDEX.exact.has(form))
          misses.push(`${form}>${base}`);
      }
    }
    expect(misses).toEqual([]);
  });
});

describe('property: the catalogue matches back (B6.7)', () => {
  it('every lemma and spelling variant offers its word', () => {
    const misses = WORDS.flatMap((w) =>
      [w.lemma, ...w.variants].filter((s) => !offered(s).has(w.slug)).map((s) => `${s}>${w.slug}`),
    );
    expect(misses).toEqual([]);
  });

  it('every generated regular form offers its word, unless it is a catalogue word itself', () => {
    let checked = 0;
    const misses: string[] = [];
    for (const w of WORDS) {
      for (const spelling of [w.lemma, ...w.variants]) {
        for (const form of regularForms(spelling, w.pos)) {
          checked += 1;
          if (!offered(form).has(w.slug) && !INDEX.exact.has(form))
            misses.push(`${form}>${w.slug}`);
        }
      }
    }
    expect(misses).toEqual([]);
    expect(checked).toBeGreaterThan(8_000);
  });
});
