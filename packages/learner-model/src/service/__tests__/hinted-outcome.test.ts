import { describe, expect, it } from 'vitest';
import { BKT_DEFAULTS } from '../../core/bkt/constants';
import { STAGE_THRESHOLDS } from '../../mastery/stage';
import { applyItemAttempted } from '../apply';
import type { ItemForOutcome } from '../db-port';
import { createLearnerService, outcomeToRating } from '../learner-service';
import { replayUser } from '../replay';
import { createMemoryDb } from './memory-db';

/**
 * A correct answer after the hint (§8 #11): FSRS HARD, pKnown unchanged, the
 * concept counts as started, an already-started stage never moves. A hinted
 * miss is an ordinary miss. The flag is frozen into the payload.
 */

const CONCEPT = 'past_simple';
const ITEM = 'item.past_simple.regular_ed';
const ITEMS: Record<string, ItemForOutcome> = {
  [ITEM]: { conceptId: CONCEPT, irtDiscrimination: 1.3, irtDifficulty: -0.5 },
  'item.past_simple.irregular_go': {
    conceptId: CONCEPT,
    irtDiscrimination: 1.0,
    irtDifficulty: 0.2,
  },
};
const USER = 'user_1';
const KEY = `${USER}:${CONCEPT}`;
const T0 = 1_750_000_000_000n;
const DAY_MS = 86_400_000n;

describe('outcomeToRating with the hint', () => {
  it('correct after the hint → HARD; incorrect stays AGAIN', () => {
    expect(outcomeToRating(true, true)).toBe('HARD');
    expect(outcomeToRating(false, true)).toBe('AGAIN');
    expect(outcomeToRating(true, false)).toBe('GOOD');
  });
});

describe('recordOutcome — hinted', () => {
  it('a correct hinted answer: HARD, pKnown unchanged, the concept started', async () => {
    const { db, events, masteries } = createMemoryDb({ items: ITEMS });
    const result = await createLearnerService(db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: true,
      hinted: true,
      occurredAtMs: T0,
    });

    expect(result).toMatchObject({
      ok: true,
      rating: 'HARD',
      pKnownBefore: BKT_DEFAULTS.pKnownInit,
      pKnownAfter: BKT_DEFAULTS.pKnownInit,
      stageBefore: 'NOT_STARTED',
      stageAfter: 'EMERGING',
    });
    expect(events[0]?.payload).toMatchObject({ correct: true, rating: 'HARD', hinted: true });
    expect(masteries.get(KEY)).toMatchObject({
      pKnown: BKT_DEFAULTS.pKnownInit,
      observationCount: 1,
      displayStage: 'EMERGING',
    });
  });

  it('FSRS schedules a hinted answer sooner than an unaided one', async () => {
    const hinted = createMemoryDb({ items: ITEMS });
    const plain = createMemoryDb({ items: ITEMS });
    const h = await createLearnerService(hinted.db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: true,
      hinted: true,
      occurredAtMs: T0,
    });
    const p = await createLearnerService(plain.db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: true,
      occurredAtMs: T0,
    });
    expect(h.ok && p.ok && h.nextDueAt < p.nextDueAt).toBe(true);
  });

  it('hints alone never climb the ladder or reach the 0.7 gate', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    let t = T0;
    for (let i = 0; i < 30; i++) {
      t += DAY_MS;
      await service.recordOutcome({
        userId: USER,
        itemId: ITEM,
        correct: true,
        hinted: true,
        occurredAtMs: t,
      });
    }
    expect(masteries.get(KEY)).toMatchObject({
      pKnown: BKT_DEFAULTS.pKnownInit,
      observationCount: 30,
      displayStage: 'EMERGING',
    });
  });

  it('a hinted answer on a started concept keeps pKnown and the stage', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    let t = T0;
    for (let i = 0; i < 12 && masteries.get(KEY)?.displayStage !== 'SOLID'; i++) {
      t += DAY_MS;
      await service.recordOutcome({ userId: USER, itemId: ITEM, correct: true, occurredAtMs: t });
    }
    const before = masteries.get(KEY);
    expect(before?.displayStage).toBe('SOLID');

    t += DAY_MS;
    const result = await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.irregular_go',
      correct: true,
      hinted: true,
      occurredAtMs: t,
    });
    expect(result).toMatchObject({ ok: true, stageBefore: 'SOLID', stageAfter: 'SOLID' });
    expect(masteries.get(KEY)).toMatchObject({
      pKnown: before?.pKnown,
      observationCount: (before?.observationCount ?? 0) + 1,
      displayStage: 'SOLID',
    });
  });

  it('a hinted miss folds exactly like a plain miss; only the flag differs', async () => {
    const hinted = createMemoryDb({ items: ITEMS });
    const plain = createMemoryDb({ items: ITEMS });
    const h = await createLearnerService(hinted.db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: false,
      hinted: true,
      occurredAtMs: T0,
    });
    const p = await createLearnerService(plain.db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: false,
      occurredAtMs: T0,
    });

    expect(h).toEqual(p);
    expect(hinted.events[0]?.payload).toEqual({
      ...(plain.events[0]?.payload as object),
      hinted: true,
    });
    expect([...hinted.masteries.entries()]).toEqual([...plain.masteries.entries()]);
    expect([...hinted.reviews.entries()]).toEqual([...plain.reviews.entries()]);
  });

  it("don't-know after the hint: AGAIN, both flags frozen", async () => {
    const { db, events } = createMemoryDb({ items: ITEMS });
    const result = await createLearnerService(db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      dontKnow: true,
      hinted: true,
      occurredAtMs: T0,
    });
    expect(result).toMatchObject({ ok: true, rating: 'AGAIN' });
    expect(events[0]?.payload).toMatchObject({ correct: false, dontKnow: true, hinted: true });
  });

  it('without the hint the payload carries no hinted key', async () => {
    const { db, events } = createMemoryDb({ items: ITEMS });
    await createLearnerService(db).recordOutcome({
      userId: USER,
      itemId: ITEM,
      correct: true,
      hinted: false,
      occurredAtMs: T0,
    });
    expect(events[0]?.payload).not.toHaveProperty('hinted');
  });

  it('replays mixed hinted / unaided events to the live projections', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    const script = [
      { correct: true, hinted: true },
      { correct: true },
      { correct: false, hinted: true },
      { correct: true, hinted: true },
      { correct: true },
    ];
    let t = T0;
    for (const [i, outcome] of script.entries()) {
      t += DAY_MS;
      await service.recordOutcome({
        userId: USER,
        itemId: i % 2 === 0 ? ITEM : 'item.past_simple.irregular_go',
        ...outcome,
        occurredAtMs: t,
      });
    }
    const liveM = new Map(masteries);
    const liveR = new Map(reviews);

    await replayUser(db, USER);

    expect(new Map(masteries)).toEqual(liveM);
    expect(new Map(reviews)).toEqual(liveR);
  });
});

describe('applyItemAttempted — hinted', () => {
  it('a NOT_STARTED concept with a high prior starts at the prior’s stage', () => {
    const prior = 0.6;
    expect(prior).toBeGreaterThanOrEqual(STAGE_THRESHOLDS.DEVELOPING);
    const fold = applyItemAttempted(
      {
        bkt: {
          pKnown: prior,
          pLearn: BKT_DEFAULTS.pLearn,
          pSlip: BKT_DEFAULTS.pSlip,
          pGuess: BKT_DEFAULTS.pGuess,
          pForgetLambda: BKT_DEFAULTS.pForgetLambda,
          lastUpdatedAt: Number(T0),
          observationCount: 0,
        },
        fsrs: null,
        stage: 'NOT_STARTED',
      },
      {
        itemId: ITEM,
        conceptId: CONCEPT,
        correct: true,
        timeMs: null,
        rating: 'HARD',
        irt: { a: 1.3, b: -0.5 },
        hinted: true,
      },
      T0 + DAY_MS,
    );
    expect(fold.stage).toBe('DEVELOPING');
    expect(fold.pKnownBefore).toBe(prior);
    expect(fold.bkt).toMatchObject({
      pKnown: prior,
      observationCount: 1,
      lastUpdatedAt: Number(T0 + DAY_MS),
    });
  });

  it('never raises a started stage, even one lagging behind pKnown', () => {
    // Stored stages follow stored pKnown, so with an unchanged pKnown the
    // ladder would not move anyway; the guard makes "no climb on a hint" hold
    // for any row, not only consistent ones.
    const fold = applyItemAttempted(
      {
        bkt: {
          pKnown: 0.8,
          pLearn: BKT_DEFAULTS.pLearn,
          pSlip: BKT_DEFAULTS.pSlip,
          pGuess: BKT_DEFAULTS.pGuess,
          pForgetLambda: BKT_DEFAULTS.pForgetLambda,
          lastUpdatedAt: Number(T0),
          observationCount: 3,
        },
        fsrs: null,
        stage: 'EMERGING',
      },
      {
        itemId: ITEM,
        conceptId: CONCEPT,
        correct: true,
        timeMs: null,
        rating: 'HARD',
        irt: { a: 1.3, b: -0.5 },
        hinted: true,
      },
      T0 + DAY_MS,
    );
    expect(fold.stage).toBe('EMERGING');
  });
});
