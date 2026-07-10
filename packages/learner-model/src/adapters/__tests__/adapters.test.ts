import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initBktState, update } from '../../core/bkt/model';
import { initCardState, reviewCard } from '../../core/fsrs/wrapper';
import { bktStateToRow, rowToBktState } from '../concept-mastery';
import { fsrsStateToRow, rowToFsrsState } from '../item-review-state';

const probArb = fc.double({ min: 0, max: 1, noNaN: true });

describe('concept-mastery adapter', () => {
  it('roundtrips a freshly initialized state', () => {
    const state = initBktState(1_700_000_000_000);
    expect(rowToBktState(bktStateToRow(state))).toEqual(state);
  });

  it('roundtrips an updated state', () => {
    const state = update(initBktState(1_700_000_000_000), {
      correct: true,
      timestamp: 1_700_000_060_000,
      item: { a: 1.2, b: -0.4 },
    });
    expect(rowToBktState(bktStateToRow(state))).toEqual(state);
  });

  it('roundtrips arbitrary valid states (property)', () => {
    fc.assert(
      fc.property(
        probArb,
        probArb,
        probArb,
        probArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 2 ** 45 }),
        fc.integer({ min: 0, max: 10_000 }),
        (pKnown, pLearn, pSlip, pGuess, lambda, at, obs) => {
          const state = {
            pKnown,
            pLearn,
            pSlip,
            pGuess,
            pForgetLambda: lambda,
            lastUpdatedAt: at,
            observationCount: obs,
          };
          expect(rowToBktState(bktStateToRow(state))).toEqual(state);
        },
      ),
    );
  });

  it('converts lastUpdatedAt to bigint for the row', () => {
    const row = bktStateToRow(initBktState(42));
    expect(row.lastUpdatedAt).toBe(42n);
  });

  it('rejects lastUpdatedAt beyond Number.MAX_SAFE_INTEGER', () => {
    const state = initBktState(0);
    const row = { ...bktStateToRow(state), lastUpdatedAt: 2n ** 60n };
    expect(() => rowToBktState(row)).toThrow(RangeError);
  });
});

describe('item-review-state adapter', () => {
  it('roundtrips a NEW card', () => {
    const state = initCardState(1_700_000_000_000n);
    expect(rowToFsrsState(fsrsStateToRow(state))).toEqual(state);
  });

  it('roundtrips a reviewed card (bigints preserved bit-exact)', () => {
    const init = initCardState(1_700_000_000_000n);
    const { state } = reviewCard(init, 'GOOD', 1_700_000_000_000n);
    const roundtripped = rowToFsrsState(fsrsStateToRow(state));
    expect(roundtripped).toEqual(state);
    expect(roundtripped.dueAt).toBe(state.dueAt);
    expect(roundtripped.lastReviewAt).toBe(state.lastReviewAt);
  });

  it('keeps null lastReviewAt as null', () => {
    const state = initCardState(0n);
    expect(fsrsStateToRow(state).lastReviewAt).toBeNull();
  });
});
