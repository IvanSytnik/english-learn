import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv } from '../cefr-j-csv';
import {
  COLLECTION_KEYS,
  collectionKeyOf,
  sortCollections,
  VOCAB_COLLECTION_TITLES,
  VOCAB_COLLECTIONS,
  VocabCollectionValue,
} from '../collections';

describe('collectionKeyOf', () => {
  it.each([
    ['Work and Jobs', 'work_jobs'],
    ['Work and jobs', 'work_jobs'],
    ['Objects and rooms', 'objects_rooms'],
    ['Things in the town, shops and shopping', 'things_town_shops_shopping'],
    ['Travel and services vocab', 'travel_services'],
    ['Ways of travelling', 'ways_travelling'],
    ['Ways of traveling', 'ways_travelling'],
    ['Art', 'arts'],
    ['Arts', 'arts'],
    [
      'Adjectives: personality, description, feelings',
      'adjectives_personality_description_feelings',
    ],
  ])('%s → %s', (label, key) => {
    expect(collectionKeyOf(label)).toBe(key);
  });

  it('throws on a label with no words', () => {
    expect(() => collectionKeyOf(' and , of ')).toThrow(/Empty collection label/);
  });

  it('every canonical key is snake_case and its own key', () => {
    for (const key of COLLECTION_KEYS) {
      expect(key).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
      expect(collectionKeyOf(key.replaceAll('_', ' '))).toBe(key);
    }
  });

  it('B6.2a: the curated allowlist — six data keys, titled in four locales; nothing else is a scope', () => {
    expect([...VOCAB_COLLECTIONS]).toEqual([
      'work_jobs',
      'news_lifestyles_current_affairs',
      'media',
      'clothes',
      'nationalities_countries',
      'books_literature',
    ]);
    for (const key of VOCAB_COLLECTIONS) {
      expect(COLLECTION_KEYS).toContain(key);
      const t = VOCAB_COLLECTION_TITLES[key];
      for (const locale of ['en', 'ru', 'uk', 'de'] as const) expect(t[locale]).toBeTruthy();
    }
    expect(Object.keys(VOCAB_COLLECTION_TITLES).sort()).toEqual([...VOCAB_COLLECTIONS].sort());
    for (const hidden of ['collocation', 'idiomatic_expressions', 'food_drink', 'education'])
      expect(VocabCollectionValue.safeParse(hidden).success).toBe(false);
  });

  it('sortCollections dedupes into the canonical order', () => {
    expect(sortCollections(['media', 'objects_rooms', 'media'])).toEqual([
      'objects_rooms',
      'media',
    ]);
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas inside quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\nlast,\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['last', ''],
    ]);
  });

  it('throws on an unterminated quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/Unterminated/);
  });

  it('csvRecords keys rows by the header and refuses a row of another width', () => {
    expect(csvRecords('h,p\nrun,verb\n')).toEqual([{ h: 'run', p: 'verb' }]);
    expect(() => csvRecords('h,p\nrun\n')).toThrow(/1 fields, header has 2/);
  });
});
