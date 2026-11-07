import { readFileSync } from 'node:fs';
import { isClosedClass } from '@englishlearn/db/vocab/closed-class';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { buildCatalogueIndex, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

/**
 * C5 (B6.7): the matcher's coverage on three committed texts over the real
 * catalogue (CEFR-J, A1–B1) — a learner's list with translations, an A2
 * prose paragraph, a messy mixed list. A change in these numbers is a
 * change in behaviour: look at it, then update the snapshot.
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

function matchFile(file: string) {
  const text = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const tokens = tokenizePaste(text);
  if (!tokens.ok) throw new Error(tokens.error);
  return { tokens, m: matchCandidates(tokens.candidates, INDEX) };
}

function coverage(file: string) {
  const { tokens, m } = matchFile(file);
  return {
    candidates: tokens.candidates.length,
    skipped: tokens.skipped,
    matched: m.matched.length,
    lemmatized: m.lemmatized.length,
    chooseYourself: m.lemmatized.filter((e) => e.preselected === null).length,
    unchecked: [...m.matched, ...m.lemmatized].filter((e) => e.preselected === null).length,
    notFound: m.notFound,
    notProcessed: tokens.notProcessed + m.notProcessed,
  };
}

describe('C5: matcher coverage on committed texts', () => {
  it('a learner’s list with translations', () => {
    expect(coverage('learner-list.txt')).toMatchInlineSnapshot(`
      {
        "candidates": 24,
        "chooseYourself": 0,
        "lemmatized": 9,
        "matched": 15,
        "notFound": [
          "brekfast",
          "qwerty",
        ],
        "notProcessed": 0,
        "skipped": 0,
        "unchecked": 2,
      }
    `);
  });

  it('an A2 prose paragraph', () => {
    expect(coverage('a2-prose.txt')).toMatchInlineSnapshot(`
      {
        "candidates": 7,
        "chooseYourself": 0,
        "lemmatized": 15,
        "matched": 38,
        "notFound": [
          "my",
          "every",
          "was",
          "have",
          "had",
        ],
        "notProcessed": 0,
        "skipped": 0,
        "unchecked": 12,
      }
    `);
  });

  it('a messy mixed list', () => {
    expect(coverage('messy-list.txt')).toMatchInlineSnapshot(`
      {
        "candidates": 16,
        "chooseYourself": 0,
        "lemmatized": 4,
        "matched": 16,
        "notFound": [
          "quotes",
          "geese",
        ],
        "notProcessed": 0,
        "skipped": 1,
        "unchecked": 4,
      }
    `);
  });

  it('#33: the A2 prose offers its closed-class words unchecked; every preselected word is open-class', () => {
    const { m } = matchFile('a2-prose.txt');
    const entries = [...m.matched, ...m.lemmatized];
    const closed = (slug: string) => {
      const l = bySlug.get(slug);
      if (!l) throw new Error(slug);
      return isClosedClass(l);
    };
    // Still offered (visible, the learner may tick them), only not preselected.
    expect(entries.filter((e) => e.slugs.every(closed)).map((e) => e.term)).toEqual([
      'to',
      'we',
      'in',
      'and',
      'i',
      'but',
      'one',
      'so',
      'next to',
      'some',
      'for',
      'of',
    ]);
    expect(entries.filter((e) => e.preselected === null)).toEqual(
      entries.filter((e) => e.slugs.every(closed)),
    );
    expect(
      entries.flatMap((e) => (e.preselected && closed(e.preselected) ? [e.term] : [])),
    ).toEqual([]);
  });
});
