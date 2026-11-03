import { describe, expect, it } from 'vitest';
import type { VocabCandidateRow, VocabSessionDb } from '../db-port';
import { createVocabSessionService } from '../vocab-session-service';

/**
 * nextVocab's own wiring (B6.2): the concept spread is fed from the words
 * just shown — their concepts, oldest first, looked up server-side — and the
 * scope reaches the selector. A fake read port, no database.
 */

const NOW = Date.parse('2026-11-03T10:00:00Z');

const word = (itemId: string, conceptId: string, frequencyRank: number): VocabCandidateRow => ({
  itemId,
  conceptId,
  lemmaKey: itemId,
  cefrLevel: 'A1',
  frequencyRank,
  collections: [],
  review: null,
});

const db = (rows: VocabCandidateRow[], todayKeys: string[] = []): VocabSessionDb => ({
  getVocabCandidates: async () => rows,
  newVocabSince: async () => ({ count: 0, lemmaKeys: todayKeys }),
  getVocabProfile: async () => ({ dailyLimit: 10, assessedLevel: null }),
});

describe('nextVocab', () => {
  // food words are the most frequent; travel and home follow.
  const rows = [
    word('food-1', 'vocab.food_drink.a1', 1),
    word('food-2', 'vocab.food_drink.a1', 2),
    word('food-3', 'vocab.food_drink.a1', 3),
    word('trip-1', 'vocab.travel.a1', 4),
    word('home-1', 'vocab.house_home.a1', 5),
  ];
  const next = (excludeItemIds: string[]) =>
    createVocabSessionService(db(rows)).nextVocab({
      userId: 'u1',
      timeZone: 'UTC',
      nowMs: NOW,
      excludeItemIds,
    });

  it('skips the concept of the words just shown', async () => {
    expect(await next([])).toMatchObject({ itemId: 'food-1' });
    expect(await next(['food-1'])).toMatchObject({ itemId: 'trip-1' });
    expect(await next(['food-1', 'trip-1'])).toMatchObject({ itemId: 'home-1' });
  });

  it('B6.2a: skips a homograph of a word just shown', async () => {
    const homographs = [
      { ...word('go-v', 'vocab.travel.a1', 1), lemmaKey: 'go' },
      { ...word('go-n', 'vocab.food_drink.a1', 2), lemmaKey: 'go' },
      word('home-1', 'vocab.house_home.a1', 3),
    ];
    const svc = createVocabSessionService(db(homographs));
    expect(
      await svc.nextVocab({ userId: 'u1', timeZone: 'UTC', nowMs: NOW, excludeItemIds: ['go-v'] }),
    ).toMatchObject({ itemId: 'home-1' });
  });

  it('B6.2a: skips a homograph of a word first met today', async () => {
    const homographs = [
      { ...word('go-n', 'vocab.food_drink.a1', 1), lemmaKey: 'go' },
      word('home-1', 'vocab.house_home.a1', 2),
    ];
    const svc = createVocabSessionService(db(homographs, ['go']));
    expect(await svc.nextVocab({ userId: 'u1', timeZone: 'UTC', nowMs: NOW })).toMatchObject({
      itemId: 'home-1',
    });
  });

  it('ignores a recent word it does not know', async () => {
    expect(await next(['gone'])).toMatchObject({ itemId: 'food-1' });
  });
});
