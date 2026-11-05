import { describe, expect, it } from 'vitest';
import { proveSlugFromSearchParams } from '@/lib/vocab-scope';

describe('proveSlugFromSearchParams (B6.6, `?prove=`)', () => {
  it('passes a well-formed public slug', () => {
    expect(proveSlugFromSearchParams({ prove: 'look-up-phrasal-verb' })).toBe(
      'look-up-phrasal-verb',
    );
  });

  it.each([
    ['absent', {}],
    ['repeated', { prove: ['apple-noun', 'bread-noun'] }],
    ['upper case', { prove: 'Apple-noun' }],
    ['a path', { prove: '../admin' }],
    ['empty', { prove: '' }],
    ['oversized', { prove: `a${'-a'.repeat(80)}` }],
  ])('ignores %s: the session starts as usual', (_, params) => {
    expect(proveSlugFromSearchParams(params)).toBeUndefined();
  });
});
