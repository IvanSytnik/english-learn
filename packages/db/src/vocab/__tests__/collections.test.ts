import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv } from '../cefr-j-csv';
import { collectionKeyOf, sortCollections, VOCAB_COLLECTIONS } from '../collections';

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
    for (const key of VOCAB_COLLECTIONS) {
      expect(key).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
      expect(collectionKeyOf(key.replaceAll('_', ' '))).toBe(key);
    }
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
