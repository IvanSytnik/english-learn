import { describe, expect, it } from "vitest";
import type { ConceptMasteryRow } from "../../adapters/concept-mastery";
import type { ItemReviewStateRow } from "../../adapters/item-review-state";
import type {
  ItemForOutcome,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
} from "../db-port";
import { createLearnerService, outcomeToRating } from "../learner-service";
import { replayUser } from "../replay";

/**
 * In-memory fake of LearnerModelDb. No atomicity (tests are sequential);
 * the point is to exercise the real service/replay logic end to end,
 * including the live-path-vs-replay determinism guarantee.
 */
function createFakeDb(items: Record<string, ItemForOutcome>) {
  const events: LearnerEventRow[] = [];
  const masteries = new Map<string, ConceptMasteryRow>(); // `${userId}:${conceptId}`
  const reviews = new Map<string, ItemReviewStateRow>(); // `${userId}:${itemId}`
  let nextId = 0;

  const tx: LearnerModelTx = {
    async appendEvent(event) {
      nextId += 1;
      events.push({
        id: `evt_${String(nextId).padStart(6, "0")}`,
        userId: event.userId,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    },
    async getConceptMastery(userId, conceptId) {
      return masteries.get(`${userId}:${conceptId}`) ?? null;
    },
    async upsertConceptMastery(userId, conceptId, write) {
      masteries.set(`${userId}:${conceptId}`, { ...write });
    },
    async getItemReviewState(userId, itemId) {
      return reviews.get(`${userId}:${itemId}`) ?? null;
    },
    async upsertItemReviewState(userId, itemId, write) {
      reviews.set(`${userId}:${itemId}`, { ...write });
    },
    async deleteSnapshots(userId) {
      for (const key of [...masteries.keys()]) {
        if (key.startsWith(`${userId}:`)) masteries.delete(key);
      }
      for (const key of [...reviews.keys()]) {
        if (key.startsWith(`${userId}:`)) reviews.delete(key);
      }
    },
    async listEventsAsc(userId, cursor, limit) {
      const sorted = events
        .filter((e) => e.userId === userId)
        .sort((a, b) =>
          a.occurredAt === b.occurredAt
            ? a.id < b.id
              ? -1
              : 1
            : a.occurredAt < b.occurredAt
              ? -1
              : 1,
        );
      const afterCursor = cursor
        ? sorted.filter(
            (e) =>
              e.occurredAt > cursor.occurredAt ||
              (e.occurredAt === cursor.occurredAt && e.id > cursor.id),
          )
        : sorted;
      return afterCursor.slice(0, limit);
    },
  };

  const db: LearnerModelDb = {
    async getItemForOutcome(itemId) {
      return items[itemId] ?? null;
    },
    async runInTx(fn) {
      return fn(tx);
    },
  };

  return { db, events, masteries, reviews };
}

const ITEMS: Record<string, ItemForOutcome> = {
  "item.past_simple.regular_ed": {
    conceptId: "past_simple",
    irtDiscrimination: 1.3,
    irtDifficulty: -0.5,
  },
  "item.past_simple.irregular_go": {
    conceptId: "past_simple",
    irtDiscrimination: 1.0,
    irtDifficulty: 0.2,
  },
  "item.present_perfect.for_since": {
    conceptId: "present_perfect",
    irtDiscrimination: 1.1,
    irtDifficulty: 0.8,
  },
};

const USER = "user_1";
const T0 = 1_750_000_000_000n;

describe("outcomeToRating", () => {
  it("maps correct -> GOOD, incorrect -> AGAIN", () => {
    expect(outcomeToRating(true)).toBe("GOOD");
    expect(outcomeToRating(false)).toBe("AGAIN");
  });
});

describe("LearnerService.recordOutcome", () => {
  it("returns ITEM_NOT_FOUND for unknown item and writes nothing", async () => {
    const { db, events, masteries, reviews } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    const result = await service.recordOutcome({
      userId: USER,
      itemId: "item.nope",
      correct: true,
      occurredAtMs: T0,
    });

    expect(result).toEqual({ ok: false, error: "ITEM_NOT_FOUND" });
    expect(events).toHaveLength(0);
    expect(masteries.size).toBe(0);
    expect(reviews.size).toBe(0);
  });

  it("appends a validated event with frozen rating + irt", async () => {
    const { db, events } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    const result = await service.recordOutcome({
      userId: USER,
      itemId: "item.past_simple.regular_ed",
      correct: false,
      timeMs: 4200,
      occurredAtMs: T0,
    });

    expect(result).toEqual({ ok: true, occurredAt: T0, rating: "AGAIN" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ITEM_ATTEMPTED");
    expect(events[0].occurredAt).toBe(T0);
    expect(events[0].payload).toEqual({
      itemId: "item.past_simple.regular_ed",
      conceptId: "past_simple",
      correct: false,
      timeMs: 4200,
      rating: "AGAIN",
      irt: { a: 1.3, b: -0.5 },
    });
  });

  it("uses ONE timestamp for event, BKT anchor and FSRS review", async () => {
    const { db, masteries, reviews } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: USER,
      itemId: "item.past_simple.regular_ed",
      correct: true,
      occurredAtMs: T0,
    });

    const mastery = masteries.get(`${USER}:past_simple`);
    const review = reviews.get(`${USER}:item.past_simple.regular_ed`);
    expect(mastery?.lastUpdatedAt).toBe(T0);
    expect(review?.lastReviewAt).toBe(T0);
  });

  it("updates BKT per concept and FSRS per item independently", async () => {
    const { db, masteries, reviews } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: USER,
      itemId: "item.past_simple.regular_ed",
      correct: true,
      occurredAtMs: T0,
    });
    await service.recordOutcome({
      userId: USER,
      itemId: "item.past_simple.irregular_go",
      correct: true,
      occurredAtMs: T0 + 60_000n,
    });
    await service.recordOutcome({
      userId: USER,
      itemId: "item.present_perfect.for_since",
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
    expect(wrong?.cardStatus).toBe("LEARNING");
    expect(right?.reps).toBe(1);
  });
});

describe("replayUser (determinism vs live path)", () => {
  it("rebuilds snapshots bit-exactly equal to the live path", async () => {
    const { db, masteries, reviews } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    const script: Array<[string, boolean, bigint]> = [
      ["item.past_simple.regular_ed", true, T0],
      ["item.past_simple.irregular_go", false, T0 + 3_600_000n],
      ["item.past_simple.regular_ed", true, T0 + 90_000_000n],
      ["item.present_perfect.for_since", true, T0 + 180_000_000n],
      ["item.past_simple.irregular_go", true, T0 + 270_000_000n],
    ];
    for (const [itemId, correct, at] of script) {
      await service.recordOutcome({
        userId: USER,
        itemId,
        correct,
        occurredAtMs: at,
      });
    }

    const liveMasteries = new Map(
      [...masteries].map(([k, v]) => [k, { ...v }]),
    );
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
    const { db, masteries } = createFakeDb(ITEMS);
    const service = createLearnerService(db);

    await service.recordOutcome({
      userId: "user_other",
      itemId: "item.past_simple.regular_ed",
      correct: true,
      occurredAtMs: T0,
    });

    const before = masteries.get("user_other:past_simple");
    await replayUser(db, USER);
    expect(masteries.get("user_other:past_simple")).toEqual(before);
  });

  it("handles a user with zero events", async () => {
    const { db } = createFakeDb(ITEMS);
    const result = await replayUser(db, "user_empty");
    expect(result).toEqual({
      eventsProcessed: 0,
      conceptsWritten: 0,
      itemsWritten: 0,
    });
  });
});
