import { describe, expect, it } from 'vitest';
import type { FsrsCardStatus } from '../../core/fsrs/types';
import type { CEFRLevel } from '../../core/graph/types';
import { selectVocab, type VocabCandidate, type VocabSelectInput } from '../select';

const NOW = 1_800_000_000_000;
const MIN = 60_000n;
const at = (offset: bigint) => BigInt(NOW) + offset;

const fresh = (
  itemId: string,
  cefrLevel: CEFRLevel = 'A1',
  extra: Partial<VocabCandidate> = {},
): VocabCandidate => ({
  itemId,
  conceptId: `vocab.c.${cefrLevel.toLowerCase()}`,
  cefrLevel,
  frequencyRank: null,
  collections: [],
  review: null,
  ...extra,
});
const reviewed = (
  itemId: string,
  dueAt: bigint,
  cardStatus: FsrsCardStatus = 'REVIEW',
  stability = 30,
): VocabCandidate => ({
  itemId,
  conceptId: 'vocab.c.a1',
  cefrLevel: 'A1',
  frequencyRank: null,
  collections: [],
  review: { dueAt, cardStatus, stability, lastReviewAt: dueAt - 10n * MIN },
});

const select = (candidates: VocabCandidate[], over: Partial<VocabSelectInput> = {}) =>
  selectVocab({
    candidates,
    nowMs: NOW,
    newToday: 0,
    dailyLimit: 10,
    targetLevel: null,
    seed: 'u:day',
    priorityItemIds: new Set(),
    hiddenItemIds: new Set(),
    recentConceptIds: [],
    ...over,
  });

describe('selectVocab', () => {
  it('serves the most overdue review first, in its ladder mode', () => {
    const out = select([
      fresh('new1'),
      reviewed('learn', at(-50n * MIN), 'LEARNING', 2.3),
      reviewed('due-late', at(-5n * MIN)),
      reviewed('due-early', at(-90n * MIN)),
      reviewed('not-due', at(60n * MIN)),
    ]);
    expect(out).toMatchObject({
      ok: true,
      itemId: 'due-early',
      reason: 'REVIEW_DUE',
      mode: 'cued_recall',
      lastReviewAt: at(-100n * MIN),
    });
  });

  it('then a due learning step, then a new word', () => {
    expect(
      select([fresh('new1'), reviewed('relearn', at(-1n * MIN), 'RELEARNING', 2.9)]),
    ).toMatchObject({ itemId: 'relearn', reason: 'LEARNING', mode: 'l1_to_en' });
    expect(select([fresh('new1'), reviewed('later', at(MIN), 'LEARNING')])).toMatchObject({
      itemId: 'new1',
      reason: 'NEW',
      mode: 'en_to_l1',
      lastReviewAt: null,
    });
  });

  it('caps new words at the daily limit', () => {
    expect(select([fresh('n')], { newToday: 9 })).toMatchObject({ ok: true, remainingNew: 1 });
    expect(select([fresh('n'), reviewed('later', at(MIN))], { newToday: 10 })).toEqual({
      ok: false,
      reason: 'NOTHING_DUE',
      nextDueAt: at(MIN),
      remainingNew: 0,
    });
    expect(select([fresh('n')], { newToday: 12, dailyLimit: 10 })).toMatchObject({
      ok: false,
      remainingNew: 0,
      nextDueAt: null,
    });
  });

  it('reviews stay available after the limit', () => {
    expect(select([fresh('n'), reviewed('due', at(-MIN))], { newToday: 10 })).toMatchObject({
      itemId: 'due',
      reason: 'REVIEW_DUE',
    });
  });

  it('introduces words at the assessed level first, then the nearest, lower first', () => {
    const pool = [fresh('a1', 'A1'), fresh('a2', 'A2'), fresh('b1', 'B1'), fresh('b2', 'B2')];
    const order = (targetLevel: CEFRLevel | null) => {
      const seen: string[] = [];
      let left = [...pool];
      while (left.length > 0) {
        const out = select(left, { targetLevel });
        if (!out.ok) break;
        seen.push(out.itemId);
        left = left.filter((c) => c.itemId !== out.itemId);
      }
      return seen;
    };
    expect(order('B1')).toEqual(['b1', 'a2', 'b2', 'a1']);
    expect(order(null)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('orders new words of a level by the day seed, deterministically', () => {
    const pool = Array.from({ length: 30 }, (_, i) => fresh(`w${i}`));
    const first = (seed: string) => {
      const out = select(pool, { seed });
      return out.ok ? out.itemId : null;
    };
    expect(first('u:1')).toBe(first('u:1'));
    expect(new Set(Array.from({ length: 10 }, (_, d) => first(`u:${d}`))).size).toBeGreaterThan(1);
  });

  it('skips the words just shown unless nothing else is left', () => {
    const pool = [reviewed('due', at(-MIN)), fresh('n')];
    expect(select(pool, { excludeItemIds: ['due'] })).toMatchObject({ itemId: 'n' });
    expect(select([reviewed('due', at(-MIN))], { excludeItemIds: ['due'] })).toMatchObject({
      itemId: 'due',
    });
  });

  it('orders new words of one level by frequency first, unknown frequency last (B6.2)', () => {
    const pool = [
      fresh('rare', 'A1', { frequencyRank: 900 }),
      fresh('none', 'A1'),
      fresh('common', 'A1', { frequencyRank: 3 }),
      fresh('b1-top', 'B1', { frequencyRank: 1 }),
    ];
    const seen: string[] = [];
    let left = [...pool];
    while (left.length > 0) {
      const out = select(left);
      if (!out.ok) break;
      seen.push(out.itemId);
      left = left.filter((c) => c.itemId !== out.itemId);
    }
    expect(seen).toEqual(['common', 'rare', 'none', 'b1-top']);
  });

  it('a scope filters new words only: due reviews and learning steps elsewhere come first (V2-5)', () => {
    const scope = { kind: 'concept', conceptId: 'vocab.food.a1' } as const;
    const inside = fresh('apple', 'A1', { conceptId: 'vocab.food.a1' });
    const outside = fresh('bus', 'A1', { conceptId: 'vocab.travel.a1' });
    const due = { ...reviewed('due-elsewhere', at(-MIN)), conceptId: 'vocab.travel.a1' };
    const later = { ...reviewed('later-elsewhere', at(5n * MIN)), conceptId: 'vocab.travel.a1' };
    expect(select([outside, inside, due], { scope })).toMatchObject({
      itemId: 'due-elsewhere',
      reason: 'REVIEW_DUE',
    });
    expect(select([outside, inside], { scope })).toMatchObject({ itemId: 'apple', reason: 'NEW' });
    expect(select([outside, later], { scope })).toEqual({
      ok: false,
      reason: 'NOTHING_DUE',
      nextDueAt: at(5n * MIN),
      remainingNew: 10,
    });
  });

  it('a collection scope picks words tagged with the key', () => {
    const scope = { kind: 'collection', key: 'work_jobs' } as const;
    const pool = [
      fresh('apple'),
      fresh('chef', 'B1', { collections: ['food_drink', 'work_jobs'] }),
    ];
    expect(select(pool, { scope })).toMatchObject({ itemId: 'chef' });
    expect(select([fresh('apple')], { scope })).toMatchObject({ ok: false });
  });

  it('never introduces a hidden word; a prioritized one beats the level distance', () => {
    const pool = [fresh('a1'), fresh('b2', 'B2')];
    expect(select(pool, { hiddenItemIds: new Set(['a1']) })).toMatchObject({ itemId: 'b2' });
    expect(select([fresh('a1')], { hiddenItemIds: new Set(['a1']) })).toMatchObject({ ok: false });
    expect(select(pool, { priorityItemIds: new Set(['b2']) })).toMatchObject({ itemId: 'b2' });
  });

  it('spreads concepts: skips the last 3 served concepts within the top 20, else falls back', () => {
    const pool = [
      fresh('x1', 'A1', { conceptId: 'x', frequencyRank: 1 }),
      fresh('y1', 'A1', { conceptId: 'y', frequencyRank: 2 }),
      fresh('z1', 'A1', { conceptId: 'z', frequencyRank: 3 }),
    ];
    expect(select(pool, { recentConceptIds: ['x'] })).toMatchObject({ itemId: 'y1' });
    expect(select(pool, { recentConceptIds: ['x', 'y'] })).toMatchObject({ itemId: 'z1' });
    expect(select(pool, { recentConceptIds: ['x', 'y', 'z'] })).toMatchObject({ itemId: 'x1' });
    // Only the last 3 count: x is older than that.
    expect(select(pool, { recentConceptIds: ['x', 'q', 'r', 's'] })).toMatchObject({
      itemId: 'x1',
    });
    // Only the top 20 count: an alternative at #21 is not reached.
    const crowded = [
      ...Array.from({ length: 20 }, (_, i) =>
        fresh(`x${i}`, 'A1', { conceptId: 'x', frequencyRank: i + 1 }),
      ),
      fresh('far', 'A1', { conceptId: 'y', frequencyRank: 99 }),
    ];
    expect(select(crowded, { recentConceptIds: ['x'] })).toMatchObject({ itemId: 'x0' });
  });
});
