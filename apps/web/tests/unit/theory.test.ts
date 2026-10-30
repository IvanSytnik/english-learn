import { describe, expect, it } from 'vitest';
import { focusSegments } from '@/lib/theory';

const marked = (text: string, focus: string[]) =>
  focusSegments(text, focus)
    .map((s) => (s.focus ? `[${s.text}]` : s.text))
    .join('');

describe('focusSegments', () => {
  it('marks every focus and keeps the sentence whole', () => {
    expect(marked('If we had a garden, we would grow tomatoes.', ['had', 'would grow'])).toBe(
      'If we [had] a garden, we [would grow] tomatoes.',
    );
  });

  it('marks whole words only: "had" is not the one in "shadow"', () => {
    expect(marked('The shadow had gone.', ['had'])).toBe('The shadow [had] gone.');
  });

  it('a focus starting with an apostrophe still matches after a letter', () => {
    expect(marked("I've never tried it.", ["'ve never tried"])).toBe("I['ve never tried] it.");
  });

  it('order of the focus list does not matter; overlaps and misses are skipped', () => {
    expect(marked('Did you enjoy it?', ['enjoy', 'Did', 'Did you', 'nope'])).toBe(
      '[Did] you [enjoy] it?',
    );
  });

  it('no focus: one plain segment', () => {
    expect(focusSegments('Bees make honey.', [])).toEqual([
      { text: 'Bees make honey.', focus: false },
    ]);
  });
});
