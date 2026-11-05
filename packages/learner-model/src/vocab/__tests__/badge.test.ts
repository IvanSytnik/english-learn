import { describe, expect, it } from 'vitest';
import type { FsrsCardStatus } from '../../core/fsrs/types';
import { initCardState, reviewCard } from '../../core/fsrs/wrapper';
import { KNOWN_FROM, REVIEWING_FROM, STAGE_BADGES, stageBadge } from '../badge';
import { LADDER_THRESHOLDS, vocabModeFor } from '../ladder';

const review = (stability: number, cardStatus: FsrsCardStatus = 'REVIEW', lapses = 0) => ({
  stability,
  cardStatus,
  lapses,
});

describe('stageBadge (V2-16)', () => {
  it('shares its thresholds with the ladder (no second copy of the numbers)', () => {
    expect(REVIEWING_FROM).toBe(LADDER_THRESHOLDS.cloze);
    expect(KNOWN_FROM).toBe(LADDER_THRESHOLDS.full_recall);
    expect([REVIEWING_FROM, KNOWN_FROM]).toEqual([7, 60]);
  });

  it('a word never answered is not started, whatever else is said', () => {
    expect(stageBadge({ review: null, proven: false })).toBe('not_started');
    expect(stageBadge({ review: review(99, 'NEW'), proven: false })).toBe('not_started');
    expect(stageBadge({ review: null, proven: true })).toBe('not_started');
  });

  it.each([
    ['0', 0, 'learning'],
    ['6.99', 6.99, 'learning'],
    ['7', 7, 'reviewing'],
    ['59.99', 59.99, 'reviewing'],
    ['60', 60, 'known'],
    ['400', 400, 'known'],
  ] as const)('S = %s → %s', (_, stability, badge) => {
    expect(stageBadge({ review: review(stability), proven: false })).toBe(badge);
  });

  it('a learning card below 7 is learning in every started status', () => {
    for (const status of ['LEARNING', 'RELEARNING', 'REVIEW'] as const) {
      expect(stageBadge({ review: review(2.31, status), proven: false })).toBe('learning');
    }
  });

  it('a passed proof is known below 60; a lapse since the proof drops it back to its stability', () => {
    // ts-fsrs schedules a passed proof (EASY on a new card) at S ≈ 8.3: "reviewing" by stability.
    const proof = reviewCard(initCardState(1_800_000_000_000n), 'EASY', 1_800_000_000_000n).state;
    expect(proof.stability).toBeGreaterThanOrEqual(REVIEWING_FROM);
    expect(proof.stability).toBeLessThan(KNOWN_FROM);
    expect(stageBadge({ review: proof, proven: false })).toBe('reviewing');
    expect(stageBadge({ review: proof, proven: true })).toBe('known');

    expect(stageBadge({ review: review(2.93, 'RELEARNING', 1), proven: true })).toBe('learning');
    expect(stageBadge({ review: review(12, 'REVIEW', 1), proven: true })).toBe('reviewing');
    expect(stageBadge({ review: review(61, 'REVIEW', 1), proven: true })).toBe('known');
  });

  it('agrees with the ladder: learning below the cloze rung, known on full recall', () => {
    for (let s = 0; s <= 200; s += 0.5) {
      const mode = vocabModeFor({ stability: s, cardStatus: 'REVIEW' });
      const badge = stageBadge({ review: review(s), proven: false });
      expect(STAGE_BADGES).toContain(badge);
      if (mode === 'en_to_l1' || mode === 'l1_to_en') expect(badge).toBe('learning');
      else if (mode === 'full_recall') expect(badge).toBe('known');
      else expect(badge).toBe('reviewing');
    }
  });
});
