import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  FSRS_RATINGS,
  type FsrsCardState,
  FsrsCardStateSchema,
  type FsrsRating,
  initCardState,
  isDue,
  retrievability,
  reviewCard,
} from '../index';

const T0 = 1_780_000_000_000n; // fixed epoch ms anchor for determinism
const DAY = 86_400_000n;
const MINUTE = 60_000n;

describe('initCardState', () => {
  it('creates a NEW card due immediately', () => {
    const s = initCardState(T0);
    expect(s.cardStatus).toBe('NEW');
    expect(s.dueAt).toBe(T0);
    expect(s.lastReviewAt).toBeNull();
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
  });

  it('produces a state that passes its own Zod schema', () => {
    expect(FsrsCardStateSchema.safeParse(initCardState(T0)).success).toBe(true);
  });
});

describe('reviewCard — first review', () => {
  it('GOOD moves NEW → LEARNING with a short intra-day step', () => {
    const { state } = reviewCard(initCardState(T0), 'GOOD', T0);
    expect(state.cardStatus).toBe('LEARNING');
    expect(state.reps).toBe(1);
    expect(state.lastReviewAt).toBe(T0);
    expect(state.dueAt).toBeGreaterThan(T0);
    expect(state.dueAt - T0).toBeLessThan(DAY); // learning step < 1 day
  });

  it('EASY graduates NEW straight to REVIEW with a multi-day interval', () => {
    const { state } = reviewCard(initCardState(T0), 'EASY', T0);
    expect(state.cardStatus).toBe('REVIEW');
    expect(state.dueAt - T0).toBeGreaterThanOrEqual(DAY);
  });

  it('AGAIN keeps the card in LEARNING with the shortest step', () => {
    const good = reviewCard(initCardState(T0), 'GOOD', T0).state;
    const again = reviewCard(initCardState(T0), 'AGAIN', T0).state;
    expect(again.cardStatus).toBe('LEARNING');
    expect(again.dueAt).toBeLessThanOrEqual(good.dueAt);
  });

  it('does not mutate the input state', () => {
    const before = initCardState(T0);
    const snapshot = { ...before };
    reviewCard(before, 'GOOD', T0);
    expect(before).toEqual(snapshot);
  });
});

describe('reviewCard — sequences', () => {
  function drill(ratings: FsrsRating[], stepMs: bigint): FsrsCardState {
    let state = initCardState(T0);
    let now = T0;
    for (const r of ratings) {
      state = reviewCard(state, r, now).state;
      now = state.dueAt + MINUTE; // review right after due
    }
    return state;
  }

  it('repeated GOOD reviews graduate to REVIEW and grow the interval', () => {
    let state = initCardState(T0);
    let now = T0;
    let prevInterval = 0n;

    for (let i = 0; i < 5; i++) {
      state = reviewCard(state, 'GOOD', now).state;
      const interval = state.dueAt - now;
      if (state.cardStatus === 'REVIEW') {
        expect(interval).toBeGreaterThanOrEqual(prevInterval);
        prevInterval = interval;
      }
      now = state.dueAt + MINUTE;
    }
    expect(state.cardStatus).toBe('REVIEW');
    expect(state.reps).toBe(5);
    expect(state.lapses).toBe(0);
  });

  it('AGAIN on a REVIEW card counts a lapse and enters RELEARNING', () => {
    // graduate first
    let state = initCardState(T0);
    let now = T0;
    while (state.cardStatus !== 'REVIEW') {
      state = reviewCard(state, 'GOOD', now).state;
      now = state.dueAt + MINUTE;
    }
    const lapsesBefore = state.lapses;

    state = reviewCard(state, 'AGAIN', now).state;
    expect(state.cardStatus).toBe('RELEARNING');
    expect(state.lapses).toBe(lapsesBefore + 1);
  });

  it('EASY yields a later due date than HARD on the same card', () => {
    const base = reviewCard(initCardState(T0), 'GOOD', T0).state;
    const now = base.dueAt + MINUTE;
    const hard = reviewCard(base, 'HARD', now).state;
    const easy = reviewCard(base, 'EASY', now).state;
    expect(easy.dueAt).toBeGreaterThan(hard.dueAt);
  });

  it('drill helper sanity: mixed sequence stays schema-valid', () => {
    const state = drill(['GOOD', 'AGAIN', 'GOOD', 'GOOD', 'EASY'], MINUTE);
    expect(FsrsCardStateSchema.safeParse(state).success).toBe(true);
  });
});

describe('retrievability', () => {
  it('is null for NEW cards', () => {
    expect(retrievability(initCardState(T0), T0)).toBeNull();
  });

  it('is in (0, 1] right after a review and decays over time', () => {
    const { state } = reviewCard(initCardState(T0), 'EASY', T0);
    const rNow = retrievability(state, T0);
    const rLater = retrievability(state, T0 + 30n * DAY);
    expect(rNow).not.toBeNull();
    expect(rLater).not.toBeNull();
    if (rNow !== null && rLater !== null) {
      expect(rNow).toBeGreaterThan(0);
      expect(rNow).toBeLessThanOrEqual(1);
      expect(rLater).toBeLessThanOrEqual(rNow);
    }
  });
});

describe('isDue', () => {
  it('NEW cards are due immediately', () => {
    expect(isDue(initCardState(T0), T0)).toBe(true);
  });

  it('reviewed cards are not due before dueAt and due after', () => {
    const { state } = reviewCard(initCardState(T0), 'EASY', T0);
    expect(isDue(state, state.dueAt - 1n)).toBe(false);
    expect(isDue(state, state.dueAt)).toBe(true);
  });
});

describe('properties', () => {
  const ratingArb = fc.constantFrom<FsrsRating>(...FSRS_RATINGS);

  it('any rating sequence keeps state schema-valid with sane invariants', () => {
    fc.assert(
      fc.property(fc.array(ratingArb, { minLength: 1, maxLength: 12 }), (ratings) => {
        let state = initCardState(T0);
        let now = T0;
        let reps = 0;
        for (const r of ratings) {
          const res = reviewCard(state, r, now);
          state = res.state;
          reps++;
          expect(FsrsCardStateSchema.safeParse(state).success).toBe(true);
          expect(state.reps).toBe(reps);
          expect(state.dueAt).toBeGreaterThanOrEqual(now);
          expect(state.lastReviewAt).toBe(now);
          expect(state.lapses).toBeLessThanOrEqual(state.reps);
          now = state.dueAt + MINUTE;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('review is deterministic (fuzz disabled): same inputs → same outputs', () => {
    fc.assert(
      fc.property(ratingArb, (rating) => {
        const a = reviewCard(initCardState(T0), rating, T0);
        const b = reviewCard(initCardState(T0), rating, T0);
        expect(a.state).toEqual(b.state);
      }),
      { numRuns: 20 },
    );
  });

  it('bigint timestamps roundtrip bit-exactly through a review', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1_600_000_000_000n, max: 2_000_000_000_000n }),
        ratingArb,
        (nowMs, rating) => {
          const { state } = reviewCard(initCardState(nowMs), rating, nowMs);
          expect(state.lastReviewAt).toBe(nowMs);
          // dueAt must be an exact bigint with no float drift
          expect(typeof state.dueAt).toBe('bigint');
        },
      ),
      { numRuns: 60 },
    );
  });
});
