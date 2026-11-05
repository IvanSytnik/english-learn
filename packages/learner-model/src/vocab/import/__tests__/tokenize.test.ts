import { describe, expect, it } from 'vitest';
import { PASTE_MAX_CANDIDATES, PASTE_MAX_CHARS, tokenizePaste } from '../tokenize';

const terms = (text: string) => {
  const res = tokenizePaste(text);
  if (!res.ok) throw new Error(res.error);
  return res.candidates.map((c) => (c.bare === c.term ? c.term : `${c.term} > ${c.bare}`));
};

describe('tokenizePaste (B6-SPEC §5)', () => {
  it('splits on , and ; first, then cuts the translation', () => {
    expect(terms('went, children, bus stop, to run, apple - яблоко, qwerty')).toEqual([
      'went',
      'children',
      'bus stop',
      'to run > run',
      'apple',
      'qwerty',
    ]);
  });

  it('a bare hyphen inside a word never splits; a spaced one cuts the translation', () => {
    expect(terms('part-time\nfull-time; make-up')).toEqual(['part-time', 'full-time', 'make-up']);
    expect(terms('part-time - неполный день')).toEqual(['part-time']);
  });

  it.each([
    ['an en dash', 'house – дом'],
    ['an em dash', 'house—дом'],
    ['a colon', 'house: a building to live in'],
    ['a tab', 'house\tдом'],
  ])('cuts the translation at %s', (_, line) => {
    expect(terms(line)).toEqual(['house']);
  });

  it('a leading `to`, then an article, is dropped from `bare` only', () => {
    expect(terms('the dog, an apple, to')).toEqual(['the dog > dog', 'an apple > apple', 'to']);
  });

  it('list markers, bracketed notes, curly apostrophes, case and marks are normalized', () => {
    expect(terms('1. Apple (n.)\n2) o’clock\n- CAFÉ [informal]\n• Pear')).toEqual([
      'apple',
      "o'clock",
      'cafe',
      'pear',
    ]);
  });

  it('a piece with no Latin letter is skipped and counted; Latin words keep their piece', () => {
    expect(tokenizePaste('apple\nяблоко, груша\napple яблоко')).toEqual({
      ok: true,
      candidates: [{ term: 'apple', bare: 'apple' }],
      notProcessed: 0,
      skipped: 2,
    });
  });

  it('duplicates are collapsed', () => {
    expect(terms('Apple, apple\nAPPLE;  apple ')).toEqual(['apple']);
  });

  it('201 distinct candidates: 200, and 1 not processed', () => {
    const words = Array.from({ length: PASTE_MAX_CANDIDATES + 1 }, (_, i) => `w${i}x`);
    const res = tokenizePaste(words.join(', '));
    expect(res).toMatchObject({ ok: true, notProcessed: 1 });
    expect(res.ok && res.candidates).toHaveLength(PASTE_MAX_CANDIDATES);
  });

  it('5 001 characters are refused; 5 000 are read; nothing readable is EMPTY', () => {
    expect(tokenizePaste('a'.repeat(PASTE_MAX_CHARS + 1))).toEqual({
      ok: false,
      error: 'TOO_LONG',
    });
    expect(tokenizePaste('a'.repeat(PASTE_MAX_CHARS)).ok).toBe(true);
    expect(tokenizePaste(' ,; \n - ')).toEqual({ ok: false, error: 'EMPTY' });
  });
});
