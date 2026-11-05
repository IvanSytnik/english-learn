import { describe, expect, it } from 'vitest';
import { loadCefrJDataset } from '../dataset';
import { LexemeSlugSchema, lexemeSlug, slugIndex } from '../slug';

describe('lexemeSlug (B6.6, public word address)', () => {
  it('lemmaKey, POS and sense, lower-case and hyphenated', () => {
    expect(lexemeSlug({ lemmaKey: 'look up', pos: 'PHRASAL_VERB', sense: '' })).toBe(
      'look-up-phrasal-verb',
    );
    expect(lexemeSlug({ lemmaKey: 'march', pos: 'NOUN', sense: 'month' })).toBe('march-noun-month');
    expect(lexemeSlug({ lemmaKey: "o'clock", pos: 'ADVERB' })).toBe('oclock-adverb');
    expect(lexemeSlug({ lemmaKey: 'a.m.', pos: 'ADVERB' })).toBe('a-m-adverb');
    expect(lexemeSlug({ lemmaKey: 'café', pos: 'NOUN' })).toBe('cafe-noun');
    expect(lexemeSlug({ lemmaKey: "driver's license", pos: 'NOUN' })).toBe('drivers-license-noun');
  });

  it('every slug passes the client schema', () => {
    for (const l of loadCefrJDataset().lexemes) {
      expect(LexemeSlugSchema.safeParse(lexemeSlug(l)).success, lexemeSlug(l)).toBe(true);
    }
    expect(LexemeSlugSchema.safeParse('cl0abc/../x').success).toBe(false);
    expect(LexemeSlugSchema.safeParse('Look-Up').success).toBe(false);
  });

  it('unique over the committed dataset (4944 entries)', () => {
    const { lexemes } = loadCefrJDataset();
    const { bySlug, ambiguous } = slugIndex(lexemes);
    expect(ambiguous).toEqual([]);
    expect(bySlug.size).toBe(lexemes.length);
    expect(bySlug.get('march-noun-month')?.sense).toBe('month');
    expect(bySlug.get('march-noun-walk')?.sense).toBe('walk');
    expect(bySlug.get('march-verb')?.pos).toBe('VERB');
  });

  it('an ambiguous slug maps to neither entry', () => {
    const { bySlug, ambiguous } = slugIndex([
      { lemmaKey: 'a.m.', pos: 'ADVERB' as const },
      { lemmaKey: 'a-m', pos: 'ADVERB' as const },
      { lemmaKey: 'run', pos: 'VERB' as const },
    ]);
    expect(ambiguous).toEqual(['a-m-adverb']);
    expect(bySlug.has('a-m-adverb')).toBe(false);
    expect(bySlug.get('run-verb')?.lemmaKey).toBe('run');
  });
});
