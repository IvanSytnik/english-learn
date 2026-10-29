import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FsrsRating } from '../../core/fsrs/types';
import { initCardState, reviewCard } from '../../core/fsrs/wrapper';
import { LADDER_THRESHOLDS, vocabModeFor } from '../ladder';
import { PAYLOAD_MODE, VOCAB_MODES } from '../types';

const T0 = 1_800_000_000_000n;
const state = (stability: number) => ({ stability, cardStatus: 'REVIEW' as const });

/** Modes served along a run of answers, each given when the card is due. */
function modesAlong(ratings: FsrsRating[]) {
  let card = initCardState(T0);
  let at = T0;
  const modes = [vocabModeFor(null)];
  for (const r of ratings) {
    card = reviewCard(card, r, at).state;
    at = card.dueAt > at ? card.dueAt : at + 60_000n;
    modes.push(vocabModeFor(card));
  }
  return modes;
}

describe('vocabModeFor (the word ladder)', () => {
  it('starts a never-answered or NEW word in mode 1', () => {
    expect(vocabModeFor(null)).toBe('en_to_l1');
    expect(vocabModeFor({ stability: 99, cardStatus: 'NEW' })).toBe('en_to_l1');
  });

  it.each([
    [0.21, 'en_to_l1'],
    [1.99, 'en_to_l1'],
    [2, 'l1_to_en'],
    [6.99, 'l1_to_en'],
    [7, 'cloze'],
    [20.99, 'cloze'],
    [21, 'cued_recall'],
    [59.99, 'cued_recall'],
    [60, 'full_recall'],
    [3000, 'full_recall'],
  ] as const)('S = %s -> %s', (s, mode) => {
    expect(vocabModeFor(state(s))).toBe(mode);
  });

  it('pins the approved thresholds', () => {
    expect(LADDER_THRESHOLDS).toEqual({ l1_to_en: 2, cloze: 7, cued_recall: 21, full_recall: 60 });
  });

  it('climbs one mode per review in time on GOOD (real ts-fsrs)', () => {
    expect(modesAlong(['GOOD', 'GOOD', 'GOOD', 'GOOD', 'GOOD'])).toEqual([
      'en_to_l1',
      'l1_to_en',
      'l1_to_en',
      'cloze',
      'cued_recall',
      'full_recall',
    ]);
  });

  it('a passed proof (EASY) starts the word in cloze', () => {
    expect(modesAlong(['EASY', 'GOOD', 'GOOD'])).toEqual([
      'en_to_l1',
      'cloze',
      'cued_recall',
      'full_recall',
    ]);
  });

  it('a lapse from cued recall drops the word back to mode 2', () => {
    const modes = modesAlong(['GOOD', 'GOOD', 'GOOD', 'GOOD', 'AGAIN']);
    expect(modes.at(-2)).toBe('cued_recall');
    expect(modes.at(-1)).toBe('l1_to_en');
  });

  it('never goes down as stability grows', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const rank = (s: number) => VOCAB_MODES.indexOf(vocabModeFor(state(s)));
          expect(rank(lo)).toBeLessThanOrEqual(rank(hi));
        },
      ),
    );
  });

  it('maps every mode to the payload mode', () => {
    expect(PAYLOAD_MODE).toEqual({
      en_to_l1: 'recognition',
      l1_to_en: 'recognition',
      cloze: 'cloze',
      cued_recall: 'recall',
      full_recall: 'recall',
    });
  });
});
