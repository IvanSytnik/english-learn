import { describe, expect, it } from 'vitest';
import type { VocabCandidateRow, VocabSessionDb } from '../db-port';
import { createVocabSessionService, type NextVocabInput } from '../vocab-session-service';

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

const NO_PREFERENCES = { prioritizedItemIds: [], hiddenItemIds: [] };

const db = (rows: VocabCandidateRow[], todayKeys: string[] = []): VocabSessionDb => ({
  getVocabCandidates: async () => rows,
  newVocabSince: async () => ({ count: 0, lemmaKeys: todayKeys }),
  getVocabProfile: async () => ({ dailyLimit: 10, assessedLevel: null }),
  getVocabPreferences: async () => NO_PREFERENCES,
  getWordListItemIds: async () => null,
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

describe('B6.5: the learner level and the allowance', () => {
  const rows = [word('food-1', 'vocab.food_drink.a1', 1)];
  const port = (assessedLevel: 'A2' | 'B1' | null, count: number): VocabSessionDb => ({
    getVocabCandidates: async () => rows,
    newVocabSince: async () => ({ count, lemmaKeys: [] }),
    getVocabProfile: async () => ({ dailyLimit: 10, assessedLevel }),
    getVocabPreferences: async () => NO_PREFERENCES,
    getWordListItemIds: async () => null,
  });

  it('nextVocab returns the assessed level with the selection (null = none)', async () => {
    for (const level of ['B1', 'A2', null] as const) {
      const out = await createVocabSessionService(port(level, 0)).nextVocab({
        userId: 'u1',
        timeZone: 'UTC',
        nowMs: NOW,
      });
      expect(out).toMatchObject({ ok: true, itemId: 'food-1', learnerLevel: level });
    }
  });

  it('remainingNew: the daily limit minus today’s first attempts, never below 0', async () => {
    const left = (count: number) =>
      createVocabSessionService(port(null, count)).remainingNew({
        userId: 'u1',
        timeZone: 'UTC',
        nowMs: NOW,
      });
    expect(await left(0)).toBe(10);
    expect(await left(7)).toBe(3);
    expect(await left(12)).toBe(0);
  });
});

describe('B6.6: preferences and list sessions', () => {
  const NOW_BIG = BigInt(NOW);
  const DAY = 86_400_000n;
  const started = (
    itemId: string,
    dueAt: bigint,
    cardStatus: 'REVIEW' | 'LEARNING' = 'REVIEW',
  ): VocabCandidateRow => ({
    ...word(itemId, 'vocab.travel.a1', 50),
    review: { dueAt, cardStatus, stability: 30, lastReviewAt: dueAt - DAY },
  });
  const port = (
    rows: VocabCandidateRow[],
    over: Partial<VocabSessionDb> = {},
    newToday = 0,
  ): VocabSessionDb => ({
    getVocabCandidates: async () => rows,
    newVocabSince: async () => ({ count: newToday, lemmaKeys: [] }),
    getVocabProfile: async () => ({ dailyLimit: 10, assessedLevel: null }),
    getVocabPreferences: async () => NO_PREFERENCES,
    getWordListItemIds: async () => null,
    ...over,
  });
  const next = (db: VocabSessionDb, scope?: NextVocabInput['scope']) =>
    createVocabSessionService(db).nextVocab({ userId: 'u1', timeZone: 'UTC', nowMs: NOW, scope });

  const rows = [
    word('freq-1', 'vocab.food_drink.a1', 1),
    word('freq-2', 'vocab.travel.a1', 2),
    word('rare', 'vocab.house_home.a1', 900),
  ];

  it('a prioritized word is served first among new words', async () => {
    expect(await next(port(rows))).toMatchObject({ itemId: 'freq-1', reason: 'NEW' });
    const prio = port(rows, {
      getVocabPreferences: async () => ({ prioritizedItemIds: ['rare'], hiddenItemIds: [] }),
    });
    expect(await next(prio)).toMatchObject({ itemId: 'rare', reason: 'NEW' });
  });

  it('…but after a due review', async () => {
    const prio = port([...rows, started('due', NOW_BIG - DAY)], {
      getVocabPreferences: async () => ({ prioritizedItemIds: ['rare'], hiddenItemIds: [] }),
    });
    expect(await next(prio)).toMatchObject({ itemId: 'due', reason: 'REVIEW_DUE' });
  });

  it('a hidden started word is never served and sets no nextDueAt; unhide restores it', async () => {
    const due = started('due', NOW_BIG - DAY);
    const later = started('later', NOW_BIG + 3n * DAY);
    const hidden = (ids: string[]) =>
      port([due, later], {
        getVocabPreferences: async () => ({ prioritizedItemIds: [], hiddenItemIds: ids }),
      });
    expect(await next(hidden(['due']))).toMatchObject({
      ok: false,
      reason: 'NOTHING_DUE',
      nextDueAt: NOW_BIG + 3n * DAY,
    });
    expect(await next(hidden(['due', 'later']))).toMatchObject({ ok: false, nextDueAt: null });
    // Un-hidden: the same review state, served again.
    expect(await next(hidden([]))).toMatchObject({
      itemId: 'due',
      reason: 'REVIEW_DUE',
      lastReviewAt: due.review?.lastReviewAt,
    });
  });

  it('the overview counts no hidden word as due', async () => {
    const svc = createVocabSessionService(
      port([started('due', NOW_BIG - DAY), started('due-2', NOW_BIG - DAY)], {
        getVocabPreferences: async () => ({ prioritizedItemIds: [], hiddenItemIds: ['due'] }),
      }),
    );
    const overview = await svc.overview({ userId: 'u1', timeZone: 'UTC', nowMs: NOW });
    expect(overview.dueNow).toBe(1);
    // Still counted in its stage: hiding changes selection, not progress.
    expect(overview.stages.known).toBe(2);
  });

  it('a list session: new words only from the list, without the level distance; reviews stay global', async () => {
    const listRows = [
      word('a1-word', 'vocab.food_drink.a1', 1),
      { ...word('b1-list', 'vocab.travel.b1', 5), cefrLevel: 'B1' as const },
      { ...word('a2-list', 'vocab.travel.a2', 9), cefrLevel: 'A2' as const },
    ];
    const lists = (extra: VocabCandidateRow[] = []) =>
      port([...listRows, ...extra], {
        getWordListItemIds: async (userId, listId) =>
          userId === 'u1' && listId === 'trip' ? ['b1-list', 'a2-list'] : null,
      });
    // Lower level first inside the list, but never a word outside it.
    expect(await next(lists(), { kind: 'list', listId: 'trip' })).toMatchObject({
      itemId: 'a2-list',
    });
    expect(
      await next(lists([started('due', NOW_BIG - DAY)]), { kind: 'list', listId: 'trip' }),
    ).toMatchObject({ itemId: 'due', reason: 'REVIEW_DUE' });
    // Not this learner's list (or archived, or gone): no new word at all.
    expect(await next(lists(), { kind: 'list', listId: 'someone-else' })).toMatchObject({
      ok: false,
      reason: 'NOTHING_DUE',
    });
  });

  it('the daily limit counts across a list session', async () => {
    const full = port(
      rows,
      {
        getWordListItemIds: async () => ['freq-1'],
      },
      10,
    );
    expect(await next(full, { kind: 'list', listId: 'trip' })).toMatchObject({
      ok: false,
      reason: 'NOTHING_DUE',
      remainingNew: 0,
    });
  });
});
