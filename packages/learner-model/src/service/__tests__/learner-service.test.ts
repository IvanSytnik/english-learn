import { describe, expect, it } from 'vitest';
import { BKT_DEFAULTS } from '../../core/bkt/constants';
import type { ItemForOutcome } from '../db-port';
import { createLearnerService, outcomeToRating } from '../learner-service';
import { replayUser } from '../replay';
import { createMemoryDb } from './memory-db';

const ITEMS: Record<string, ItemForOutcome> = {
  'item.past_simple.regular_ed': {
    conceptId: 'past_simple',
    irtDiscrimination: 1.3,
    irtDifficulty: -0.5,
  },
  'item.past_simple.irregular_go': {
    conceptId: 'past_simple',
    irtDiscrimination: 1.0,
    irtDifficulty: 0.2,
  },
  'item.present_perfect.for_since': {
    conceptId: 'present_perfect',
    irtDiscrimination: 1.1,
    irtDifficulty: 0.8,
  },
};

const USER = 'user_1';
const T0 = 1_750_000_000_000n;
const DAY_MS = 86_400_000n;

describe('outcomeToRating', () => {
  it('maps correct -> GOOD, incorrect -> AGAIN', () => {
    expect(outcomeToRating(true)).toBe('GOOD');
    expect(outcomeToRating(false)).toBe('AGAIN');
  });
});

describe('LearnerService.recordOutcome', () => {
  it('returns ITEM_NOT_FOUND for unknown item and writes nothing', async () => {
    const { db, events, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    const result = await service.recordOutcome({
      userId: USER,
      itemId: 'item.nope',
      correct: true,
      occurredAtMs: T0,
    });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(events).toHaveLength(0);
    expect(masteries.size).toBe(0);
    expect(reviews.size).toBe(0);
  });

  it('appends a validated event with frozen rating + irt', async () => {
    const { db, events } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    const result = await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.regular_ed',
      correct: false,
      timeMs: 4200,
      occurredAtMs: T0,
    });

    expect(result).toMatchObject({ ok: true, occurredAt: T0, rating: 'AGAIN' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ITEM_ATTEMPTED');
    expect(events[0].occurredAt).toBe(T0);
    expect(events[0].payload).toEqual({
      itemId: 'item.past_simple.regular_ed',
      conceptId: 'past_simple',
      correct: false,
      timeMs: 4200,
      rating: 'AGAIN',
      irt: { a: 1.3, b: -0.5 },
    });
  });

  it('reports post-answer deltas that match the persisted projections (E3)', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    // First ever outcome on the concept, wrong: cold prior, intra-day relearn step.
    const first = await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.regular_ed',
      correct: false,
      occurredAtMs: T0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.conceptId).toBe('past_simple');
    expect(first.pKnownBefore).toBe(BKT_DEFAULTS.pKnownInit);
    expect(first.pKnownAfter).toBe(masteries.get(`${USER}:past_simple`)?.pKnown);
    expect(first.nextDueAt).toBe(reviews.get(`${USER}:item.past_simple.regular_ed`)?.dueAt);
    expect(first.scheduledDays).toBe(0);
    expect(first.cardStatus).toBe('LEARNING');

    // 30 days later on a sibling item: pKnownBefore is exactly the stored
    // value (no time decay, §8 #10) and a correct answer can only raise it.
    const stored = masteries.get(`${USER}:past_simple`);
    if (!stored) throw new Error('mastery missing');
    const second = await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.irregular_go',
      correct: true,
      occurredAtMs: T0 + 30n * DAY_MS,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.pKnownBefore).toBe(stored.pKnown);
    expect(second.pKnownAfter).toBeGreaterThan(second.pKnownBefore);
    expect(second.pKnownAfter).toBe(masteries.get(`${USER}:past_simple`)?.pKnown);
  });

  it('reports a multi-day interval once the card graduates to REVIEW (E3)', async () => {
    const { db, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    const itemId = 'item.present_perfect.for_since';

    await service.recordOutcome({ userId: USER, itemId, correct: true, occurredAtMs: T0 });
    const graduated = await service.recordOutcome({
      userId: USER,
      itemId,
      correct: true,
      occurredAtMs: T0 + DAY_MS,
    });
    expect(graduated.ok).toBe(true);
    if (!graduated.ok) return;
    expect(graduated.cardStatus).toBe('REVIEW');
    expect(graduated.scheduledDays).toBeGreaterThan(0);
    expect(graduated.nextDueAt).toBe(reviews.get(`${USER}:${itemId}`)?.dueAt);
    expect(graduated.nextDueAt > T0 + DAY_MS).toBe(true);
  });

  it("records don't-know as an incorrect AGAIN attempt and freezes the flag (E4)", async () => {
    const flagged = createMemoryDb({ items: ITEMS });
    const plain = createMemoryDb({ items: ITEMS });
    const itemId = 'item.past_simple.regular_ed';

    const dk = await createLearnerService(flagged.db).recordOutcome({
      userId: USER,
      itemId,
      dontKnow: true,
      occurredAtMs: T0,
    });
    const wrong = await createLearnerService(plain.db).recordOutcome({
      userId: USER,
      itemId,
      correct: false,
      occurredAtMs: T0,
    });

    expect(dk).toEqual(wrong);
    expect(dk).toMatchObject({ ok: true, rating: 'AGAIN' });
    expect(flagged.events[0]?.payload).toEqual({
      ...(plain.events[0]?.payload as object),
      dontKnow: true,
    });
    expect(plain.events[0]?.payload).not.toHaveProperty('dontKnow');
    // Projections are bit-identical to an ordinary wrong answer.
    expect([...flagged.masteries.entries()]).toEqual([...plain.masteries.entries()]);
    expect([...flagged.reviews.entries()]).toEqual([...plain.reviews.entries()]);
  });

  it("replays a don't-know event to the same projections as the live path (E4)", async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.regular_ed',
      correct: true,
      occurredAtMs: T0,
    });
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.irregular_go',
      dontKnow: true,
      occurredAtMs: T0 + DAY_MS,
    });
    const liveM = new Map(masteries);
    const liveR = new Map(reviews);

    await replayUser(db, USER);

    expect(new Map(masteries)).toEqual(liveM);
    expect(new Map(reviews)).toEqual(liveR);
  });

  it('persists displayStage from the fold and replays it identically (E5)', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    const itemId = 'item.past_simple.regular_ed';
    const key = `${USER}:past_simple`;

    // Climb with a realistic 3x/week rhythm (1–3 days between answers). Before
    // §8 #10 this plateaued near pKnown 0.18 and never left EMERGING.
    const gapsDays = [1n, 2n, 3n];
    const seen: string[] = [];
    let t = T0;
    for (let i = 0; i < 12 && masteries.get(key)?.displayStage !== 'HIGH_SOLID'; i++) {
      t += (gapsDays[i % gapsDays.length] as bigint) * DAY_MS;
      await service.recordOutcome({ userId: USER, itemId, correct: true, occurredAtMs: t });
      seen.push(masteries.get(key)?.displayStage ?? 'missing');
    }
    expect(seen[0]).not.toBe('NOT_STARTED');
    // The climb tops out (with the 4PL of §8 #19 it may jump DEVELOPING →
    // HIGH_SOLID in one answer, skipping SOLID).
    expect(seen.at(-1)).toBe('HIGH_SOLID');
    // Ladder only moves up on a run of correct answers.
    const order = ['EMERGING', 'DEVELOPING', 'SOLID', 'HIGH_SOLID'];
    for (let i = 1; i < seen.length; i++) {
      expect(order.indexOf(seen[i] as string)).toBeGreaterThanOrEqual(
        order.indexOf(seen[i - 1] as string),
      );
    }

    // Then a few misses — hysteresis decides; replay must land on the same stage.
    for (let i = 0; i < 3; i++) {
      t += 2n * DAY_MS;
      await service.recordOutcome({ userId: USER, itemId, correct: false, occurredAtMs: t });
    }
    const live = masteries.get(key);
    await replayUser(db, USER);
    expect(masteries.get(key)).toEqual(live);
  });

  it('reports the stored stage before and after the outcome (U2)', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);
    const itemId = 'item.past_simple.regular_ed';
    const first = await service.recordOutcome({
      userId: USER,
      itemId,
      correct: true,
      occurredAtMs: T0,
    });
    expect(first).toMatchObject({ ok: true, stageBefore: 'NOT_STARTED', stageAfter: 'EMERGING' });

    let last = first;
    for (let i = 1; i <= 8; i++) {
      last = await service.recordOutcome({
        userId: USER,
        itemId,
        correct: true,
        occurredAtMs: T0 + BigInt(i) * DAY_MS,
      });
      if (last.ok && last.stageAfter !== last.stageBefore) break;
    }
    expect(last.ok && last.stageAfter).toBe(masteries.get(`${USER}:past_simple`)?.displayStage);
    expect(last.ok && last.stageBefore).not.toBe(last.ok && last.stageAfter);
  });

  it('uses ONE timestamp for event, BKT anchor and FSRS review', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.regular_ed',
      correct: true,
      occurredAtMs: T0,
    });

    const mastery = masteries.get(`${USER}:past_simple`);
    const review = reviews.get(`${USER}:item.past_simple.regular_ed`);
    expect(mastery?.lastUpdatedAt).toBe(T0);
    expect(review?.lastReviewAt).toBe(T0);
  });

  it('updates BKT per concept and FSRS per item independently', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.regular_ed',
      correct: true,
      occurredAtMs: T0,
    });
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.past_simple.irregular_go',
      correct: true,
      occurredAtMs: T0 + 60_000n,
    });
    await service.recordOutcome({
      userId: USER,
      itemId: 'item.present_perfect.for_since',
      correct: false,
      occurredAtMs: T0 + 120_000n,
    });

    // Two items share past_simple -> one mastery row folded twice.
    expect(masteries.size).toBe(2);
    expect(masteries.get(`${USER}:past_simple`)?.observationCount).toBe(2);
    expect(masteries.get(`${USER}:present_perfect`)?.observationCount).toBe(1);
    expect(reviews.size).toBe(3);

    // Two correct answers push pKnown above one incorrect answer's concept.
    // Both concepts got distinct, valid pKnown values (exact direction depends
    // on BKT_DEFAULTS, which this test suite does not own — see bkt.test.ts
    // for the update() monotonicity guarantees).
    const ps = masteries.get(`${USER}:past_simple`);
    const pp = masteries.get(`${USER}:present_perfect`);
    expect(ps?.pKnown).toBeGreaterThanOrEqual(0);
    expect(ps?.pKnown).toBeLessThanOrEqual(1);
    expect(pp?.pKnown).toBeGreaterThanOrEqual(0);
    expect(pp?.pKnown).toBeLessThanOrEqual(1);
    expect(ps?.pKnown).not.toBe(pp?.pKnown);

    // FSRS: incorrect answer -> AGAIN -> lapse-free LEARNING with sooner due.
    const wrong = reviews.get(`${USER}:item.present_perfect.for_since`);
    const right = reviews.get(`${USER}:item.past_simple.regular_ed`);
    expect(wrong?.cardStatus).toBe('LEARNING');
    expect(right?.reps).toBe(1);
  });
});

describe('replayUser (determinism vs live path)', () => {
  it('rebuilds snapshots bit-exactly equal to the live path', async () => {
    const { db, masteries, reviews } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    const script: Array<[string, boolean, bigint]> = [
      ['item.past_simple.regular_ed', true, T0],
      ['item.past_simple.irregular_go', false, T0 + 3_600_000n],
      ['item.past_simple.regular_ed', true, T0 + 90_000_000n],
      ['item.present_perfect.for_since', true, T0 + 180_000_000n],
      ['item.past_simple.irregular_go', true, T0 + 270_000_000n],
    ];
    for (const [itemId, correct, at] of script) {
      await service.recordOutcome({
        userId: USER,
        itemId,
        correct,
        occurredAtMs: at,
      });
    }

    const liveMasteries = new Map([...masteries].map(([k, v]) => [k, { ...v }]));
    const liveReviews = new Map([...reviews].map(([k, v]) => [k, { ...v }]));

    const result = await replayUser(db, USER);

    expect(result).toEqual({
      eventsProcessed: 5,
      conceptsWritten: 2,
      itemsWritten: 3,
    });
    expect(masteries).toEqual(liveMasteries);
    expect(reviews).toEqual(liveReviews);
  });

  it("does not touch other users' snapshots", async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS });
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: 'user_other',
      itemId: 'item.past_simple.regular_ed',
      correct: true,
      occurredAtMs: T0,
    });

    const before = masteries.get('user_other:past_simple');
    await replayUser(db, USER);
    expect(masteries.get('user_other:past_simple')).toEqual(before);
  });

  it('handles a user with zero events', async () => {
    const { db } = createMemoryDb({ items: ITEMS });
    const result = await replayUser(db, 'user_empty');
    expect(result).toEqual({
      eventsProcessed: 0,
      conceptsWritten: 0,
      itemsWritten: 0,
    });
  });
});
