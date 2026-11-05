import { describe, expect, it } from 'vitest';
import {
  SEARCH_MAX_CHARS,
  SEARCH_MAX_RESULTS,
  type SearchableWord,
  searchCatalogue,
} from '../search';

const word = (
  lemma: string,
  frequencyRank: number | null,
  gloss: { ru?: string; uk?: string; de?: string; en?: string } = {},
  variants: string[] = [],
  slug = `${lemma.replace(/\s+/g, '-')}-noun`,
): SearchableWord => ({
  slug,
  lemma,
  variants,
  frequencyRank,
  definitions: { en: gloss.en ?? `the ${lemma}` },
  translations: { ru: gloss.ru, uk: gloss.uk, de: gloss.de },
});

const POOL = [
  word('apple', 300, { ru: 'яблоко', de: 'Apfel' }),
  word('application', 900, { ru: 'заявление', de: 'Bewerbung' }),
  word('apply', 500, { ru: 'подавать заявление' }),
  word('pineapple', 2000, { ru: 'ананас' }),
  word('colour', 400, { ru: 'цвет' }, ['color']),
  word('hedgehog', null, { ru: 'ёж' }),
  word('castle', 1500, { ru: `за${String.fromCharCode(0x301)}мок` }),
  word('café', 1800, { ru: 'кафе' }),
  word('bus stop', 1200, { ru: 'остановка автобуса' }),
];

const find = (q: string, locale: 'ru' | 'uk' | 'de' | 'en' = 'ru') =>
  searchCatalogue(POOL, q, locale).map((w) => w.lemma);

describe('searchCatalogue (B6.7)', () => {
  it('headword prefix, frequent first; an exact headword before every prefix', () => {
    expect(find('app')).toEqual(['apple', 'apply', 'application']);
    expect(find('apply')).toEqual(['apply']);
    expect(find('APP')).toEqual(['apple', 'apply', 'application']);
  });

  it('the exact headword comes first even when a prefix match is more frequent', () => {
    const pool = [word('apple', 1), word('app', 50), word('colour', 2, {}, ['color'])];
    expect(searchCatalogue(pool, 'app', 'ru').map((w) => w.lemma)).toEqual(['app', 'apple']);
    expect(
      searchCatalogue([...pool, word('colorful', 1)], 'color', 'ru').map((w) => w.lemma),
    ).toEqual(['colour', 'colorful']);
  });

  it('a variant prefix finds the word (US spelling)', () => {
    expect(find('colo')).toEqual(['colour']);
    expect(find('color')).toEqual(['colour']);
  });

  it('gloss substring in the learner’s language, after every English match', () => {
    expect(find('заявл')).toEqual(['apply', 'application']);
    expect(find('блок')).toEqual(['apple']);
    // German glosses: English prefixes first, then gloss hits (a missing gloss is the definition).
    expect(find('ap', 'de')).toEqual(['apple', 'apply', 'application', 'pineapple']);
    expect(find('bewer', 'de')).toEqual(['application']);
  });

  it('en: the English definition is the gloss', () => {
    expect(find('the pine', 'en')).toEqual(['pineapple']);
  });

  it('ё is read as е, stress marks are ignored, accents fold on the English side', () => {
    expect(find('еж')).toEqual(['hedgehog']);
    expect(find('ёж')).toEqual(['hedgehog']);
    expect(find('замок')).toEqual(['castle']);
    expect(find('cafe')).toEqual(['café']);
  });

  it('a multiword headword by its prefix, spaces normalized', () => {
    expect(find('  bus   st ')).toEqual(['bus stop']);
  });

  it('fewer than 2 characters or an over-long query finds nothing', () => {
    expect(find('a')).toEqual([]);
    expect(find(' ')).toEqual([]);
    expect(find('ё')).toEqual([]);
    expect(find('a'.repeat(SEARCH_MAX_CHARS + 1))).toEqual([]);
  });

  it('at most 20 results, ties broken by slug — deterministic', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      word(`zz${String(29 - i).padStart(2, '0')}`, null),
    );
    const hits = searchCatalogue(many, 'zz', 'ru');
    expect(hits).toHaveLength(SEARCH_MAX_RESULTS);
    expect(hits[0]?.lemma).toBe('zz00');
    expect(hits.map((h) => h.slug)).toEqual([...hits.map((h) => h.slug)].sort());
    expect(searchCatalogue([...many].reverse(), 'zz', 'ru')).toEqual(hits);
  });

  it('a word matching several ways is listed once, at its best rank', () => {
    const both = [word('apple', 1, { ru: 'apple pie' })];
    expect(searchCatalogue(both, 'apple', 'ru')).toHaveLength(1);
  });
});
