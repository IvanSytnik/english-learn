import { describe, expect, it } from 'vitest';
import type { FsrsCardStatus } from '../../core/fsrs/types';
import { vocabModeFor } from '../ladder';
import { summarizeVocab, WORD_STAGES, wordStage } from '../overview';
import { VOCAB_MODES } from '../types';

const NOW = 1_800_000_000_000;
const MIN = 60_000n;

const review = (stability: number, dueOffset: bigint, cardStatus: FsrsCardStatus = 'REVIEW') => ({
  dueAt: BigInt(NOW) + dueOffset,
  cardStatus,
  stability,
  lastReviewAt: BigInt(NOW) - 100n * MIN,
});
const word = (itemId: string, conceptId: string, r: ReturnType<typeof review> | null) => ({
  itemId,
  conceptId,
  cefrLevel: 'A1' as const,
  review: r,
});

describe('wordStage', () => {
  it('is the ladder rung, never a number', () => {
    expect(wordStage(null)).toBe('new');
    expect(wordStage(review(0, 0n, 'NEW'))).toBe('new');
    expect(wordStage(review(1, 0n, 'LEARNING'))).toBe('learning');
    expect(wordStage(review(2.31, 0n, 'LEARNING'))).toBe('learning');
    expect(wordStage(review(8.3, 0n))).toBe('familiar');
    expect(wordStage(review(30, 0n))).toBe('known');
    expect(wordStage(review(163, 0n))).toBe('mastered');
  });

  it('agrees with the mode the session serves, for every mode', () => {
    const order = new Map(WORD_STAGES.map((s, i) => [s, i]));
    let last = 0;
    for (const s of [0.5, 2, 7, 21, 60, 400]) {
      const r = review(s, 0n);
      const rank = order.get(wordStage(r)) ?? -1;
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
      expect(VOCAB_MODES).toContain(vocabModeFor(r));
    }
    expect(last).toBe(WORD_STAGES.length - 1);
  });
});

describe('summarizeVocab', () => {
  it('counts due words, stages overall and per concept', () => {
    const out = summarizeVocab(
      [
        word('a', 'vocab.food_drink.a1', null),
        word('b', 'vocab.food_drink.a1', review(1, -1n * MIN, 'LEARNING')),
        word('c', 'vocab.food_drink.a1', review(30, 5n * MIN)),
        word('d', 'vocab.travel.a1', review(100, -60n * MIN)),
        word('e', 'vocab.travel.a1', review(0, -60n * MIN, 'NEW')),
        word('f', 'vocab.daily_life.a2', review(8, 0n, 'RELEARNING')),
      ],
      NOW,
    );
    expect(out.dueNow).toBe(3);
    expect(out.stages).toEqual({ new: 2, learning: 1, familiar: 1, known: 1, mastered: 1 });
    expect(out.concepts).toEqual([
      {
        conceptId: 'vocab.daily_life.a2',
        total: 1,
        started: 1,
        stages: { new: 0, learning: 0, familiar: 1, known: 0, mastered: 0 },
      },
      {
        conceptId: 'vocab.food_drink.a1',
        total: 3,
        started: 2,
        stages: { new: 1, learning: 1, familiar: 0, known: 1, mastered: 0 },
      },
      {
        conceptId: 'vocab.travel.a1',
        total: 2,
        started: 1,
        stages: { new: 1, learning: 0, familiar: 0, known: 0, mastered: 1 },
      },
    ]);
  });

  it('an empty vocabulary is all zeros', () => {
    expect(summarizeVocab([], NOW)).toEqual({
      dueNow: 0,
      stages: { new: 0, learning: 0, familiar: 0, known: 0, mastered: 0 },
      concepts: [],
    });
  });
});
