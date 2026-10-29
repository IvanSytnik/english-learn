import { describe, expect, it } from 'vitest';
import { createLearnerService } from '../learner-service';
import { replayUser } from '../replay';
import { createMemoryDb, type MemoryItem } from './memory-db';

/**
 * recordVocabOutcome (B2.5): the same locked write flow as recordOutcome
 * (lock first, idempotency, one fold, both projections) on the vocab pool
 * only, with the ladder mode frozen into the payload and the "Know -> prove"
 * seam — a passed proof is EASY + `proof: true`, a failed one an ordinary
 * attempt. Replay rebuilds the same projections.
 */

const VOCAB = 'item.vocab.apple';
const GRAMMAR = 'item.past_simple.regular_ed';
const ITEMS: Record<string, MemoryItem> = {
  [VOCAB]: {
    conceptId: 'vocab.food_drink.a1',
    irtDiscrimination: 1,
    irtDifficulty: 0,
    pool: 'vocab',
  },
  [GRAMMAR]: { conceptId: 'past_simple', irtDiscrimination: 1.3, irtDifficulty: -0.5 },
};
const USER = 'user_1';
const T0 = 1_750_000_000_000n;
const DAY_MS = 86_400_000n;

const setup = () => {
  const memory = createMemoryDb({ items: ITEMS });
  return { ...memory, service: createLearnerService(memory.db) };
};

describe('recordVocabOutcome', () => {
  it('records a vocabulary answer with its mode, under the user lock', async () => {
    const { service, events, reviews, transactions } = setup();
    const result = await service.recordVocabOutcome({
      userId: USER,
      itemId: VOCAB,
      correct: true,
      mode: 'recognition',
      occurredAtMs: T0,
    });

    expect(result).toMatchObject({ ok: true, rating: 'GOOD', conceptId: 'vocab.food_drink.a1' });
    expect(events[0]?.payload).toEqual({
      itemId: VOCAB,
      conceptId: 'vocab.food_drink.a1',
      correct: true,
      timeMs: null,
      rating: 'GOOD',
      irt: { a: 1, b: 0 },
      mode: 'recognition',
    });
    expect(reviews.get(`${USER}:${VOCAB}`)?.cardStatus).toBe('LEARNING');
    expect(transactions[0]?.[0]).toBe('lockUser');
  });

  it('rejects a grammar item; recordOutcome rejects a vocabulary item', async () => {
    const { service, events } = setup();
    await expect(
      service.recordVocabOutcome({ userId: USER, itemId: GRAMMAR, correct: true, mode: 'cloze' }),
    ).resolves.toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    await expect(
      service.recordOutcome({ userId: USER, itemId: VOCAB, correct: true }),
    ).resolves.toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(events).toHaveLength(0);
  });

  it('a passed proof is EASY: FSRS schedules the word as known (S ≈ 8.3, +8 d)', async () => {
    const { service, events, reviews } = setup();
    const result = await service.recordVocabOutcome({
      userId: USER,
      itemId: VOCAB,
      correct: true,
      mode: 'recall',
      proof: true,
      occurredAtMs: T0,
    });

    expect(result).toMatchObject({ ok: true, rating: 'EASY', scheduledDays: 8 });
    expect(events[0]?.payload).toMatchObject({ rating: 'EASY', mode: 'recall', proof: true });
    const review = reviews.get(`${USER}:${VOCAB}`);
    expect(review?.cardStatus).toBe('REVIEW');
    expect(review?.stability).toBeCloseTo(8.3, 1);
    expect(review?.dueAt).toBe(T0 + 8n * DAY_MS);
  });

  it.each([
    ['a failed proof', { correct: false }, 'AGAIN'],
    ['a don’t-know proof', { dontKnow: true }, 'AGAIN'],
    ['a hinted proof', { correct: true, hinted: true }, 'HARD'],
  ] as const)('%s is an ordinary attempt without the flag', async (_, answer, rating) => {
    const { service, events } = setup();
    const result = await service.recordVocabOutcome({
      userId: USER,
      itemId: VOCAB,
      mode: 'recall',
      proof: true,
      ...answer,
    });

    expect(result).toMatchObject({ ok: true, rating });
    expect(events[0]?.payload).not.toHaveProperty('proof');
  });

  it('refuses a proof outside recall (payload schema) and writes nothing', async () => {
    const { service, events } = setup();
    await expect(
      service.recordVocabOutcome({
        userId: USER,
        itemId: VOCAB,
        correct: true,
        mode: 'recognition',
        proof: true,
      }),
    ).rejects.toThrow(/proof/);
    expect(events).toHaveLength(0);
  });

  it('records a retried submission once (idempotency key)', async () => {
    const { service, events } = setup();
    const answer = {
      userId: USER,
      itemId: VOCAB,
      correct: true,
      mode: 'cloze' as const,
      idempotencyKey: 'k1',
    };
    await service.recordVocabOutcome(answer);
    await expect(service.recordVocabOutcome(answer)).resolves.toMatchObject({
      ok: true,
      duplicate: true,
    });
    expect(events).toHaveLength(1);
  });

  it('replay rebuilds the live projections from vocabulary and grammar events', async () => {
    const { db, service, masteries, reviews } = setup();
    let at = T0;
    for (const [i, correct] of [true, false, true, true].entries()) {
      at += DAY_MS;
      await service.recordVocabOutcome({
        userId: USER,
        itemId: VOCAB,
        correct,
        mode: i === 0 ? 'recall' : 'recognition',
        proof: i === 0,
        occurredAtMs: at,
      });
      await service.recordOutcome({
        userId: USER,
        itemId: GRAMMAR,
        correct,
        occurredAtMs: at + 1n,
      });
    }
    const liveM = new Map(masteries);
    const liveR = new Map(reviews);

    await replayUser(db, USER);

    expect(new Map(masteries)).toEqual(liveM);
    expect(new Map(reviews)).toEqual(liveR);
  });
});
