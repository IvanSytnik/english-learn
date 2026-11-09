import { isClosedClass } from '@englishlearn/db/vocab/closed-class';
import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { secondarySenseIds, shadowedIdentities } from '@englishlearn/db/vocab/frequency';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { buildCatalogueIndex, isSecondaryInPaste, matchCandidates } from '../match';
import { PASTE_NO_PRESELECT, PASTE_NO_PRESELECT_ENTRIES } from '../no-preselect';
import { tokenizePaste } from '../tokenize';

/**
 * #40 (B6.7b, V2-19) and #42 (B6.7c, V2-19a) over the real catalogue: a
 * homograph of a function word is offered, never preselected — an entry that
 * is effectively secondary (flagged `shadowedByExcludedPos` and not in
 * SECONDARY_SENSE_OVERRIDES: `can` noun, `May`) or listed in
 * PASTE_NO_PRESELECT (`IT`). `need` (verb) and `little` (adjective) are
 * overridden to primary, so preselected: the rank's own predicate.
 */

const { lexemes } = loadCefrJDataset();
const { bySlug } = slugIndex(lexemes);
const INDEX = buildCatalogueIndex(
  [...bySlug].map(([slug, l]) => ({
    slug,
    lemma: l.lemma,
    lemmaKey: l.lemmaKey,
    pos: l.pos,
    sense: l.sense,
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

  it('need, little: the verb and the adjective preselected again (#42); may, can stay unchecked', () => {
    const { m } = entries('need, little, may, can');
    expect(m.matched.map((e) => [e.term, e.preselected, e.slugs])).toEqual([
      ['need', 'need-verb', ['need-verb']],
      ['little', 'little-adjective', ['little-adjective', 'little-adverb', 'little-pronoun']],
      ['may', null, ['may-noun']],
      ['can', null, ['can-noun']],
    ]);
  });

  it('rank and paste agree on each of the 58 flagged entries: secondary by the rank ⇔ not preselected (V2-19a)', () => {
    const rows = lexemes.map((l) => ({
      id: lexemeIdentity(l),
      lemmaKey: l.lemmaKey,
      pos: l.pos,
      sense: l.sense,
      cefrLevel: l.cefrLevel,
      status: 'PUBLISHED',
      frequencyZipf: null,
      frequencyRank: null,
    }));
    const rankSecondary = secondarySenseIds(rows, shadowedIdentities(lexemes));
    const flagged = [...bySlug].filter(([, l]) => l.shadowedByExcludedPos === true);
    expect(flagged.length).toBe(58);
    const verdicts = flagged.map(([slug, l]) => {
      const offered = entries(l.lemma).all.find((e) => e.slugs.includes(slug));
      expect(offered, slug).toBeDefined();
      return {
        slug,
        rank: rankSecondary.has(lexemeIdentity(l)),
        paste: isSecondaryInPaste(l),
        preselected: offered?.preselected === slug,
      };
    });
    expect(verdicts.filter((v) => v.rank !== v.paste).map((v) => v.slug)).toEqual([]);
    // Open-class entries the rank makes primary are preselected; every other one is not.
    expect(verdicts.filter((v) => v.preselected).map((v) => v.slug)).toEqual([
      'little-adjective',
      'need-verb',
    ]);
    expect(verdicts.filter((v) => !v.rank).map((v) => v.slug)).toEqual([
      'little-adjective',
      'need-verb',
    ]);
  });

  it('each listed entry is offered unchecked when its lemma is pasted', () => {
    for (const slug of PASTE_NO_PRESELECT) {
      const offered = entries(word(slug).lemma).all.find((e) => e.slugs.includes(slug));
      expect(offered, slug).toBeDefined();
      expect(offered?.preselected, slug).not.toBe(slug);
    }
  });

  it('pasting any catalogue lemma never preselects a closed-class, effectively secondary or listed word', () => {
    const bad: string[] = [];
    for (const [, l] of bySlug) {
      for (const e of entries(l.lemma).all) {
        if (e.preselected === null) continue;
        const p = word(e.preselected);
        if (isClosedClass(p) || isSecondaryInPaste(p) || PASTE_NO_PRESELECT.has(e.preselected)) {
          bad.push(`${l.lemma} → ${e.preselected}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
