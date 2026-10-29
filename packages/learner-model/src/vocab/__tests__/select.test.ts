import { describe, expect, it } from 'vitest';
import type { FsrsCardStatus } from '../../core/fsrs/types';
import type { CEFRLevel } from '../../core/graph/types';
import { selectVocab, type VocabCandidate, type VocabSelectInput } from '../select';

const NOW = 1_800_000_000_000;
const MIN = 60_000n;
const at = (offset: bigint) => BigInt(NOW) + offset;

const fresh = (itemId: string, cefrLevel: CEFRLevel = 'A1'): VocabCandidate => ({
  itemId,
  cefrLevel,
  review: null,
});
const reviewed = (
  itemId: string,
  dueAt: bigint,
  cardStatus: FsrsCardStatus = 'REVIEW',
  stability = 30,
): VocabCandidate => ({
  itemId,
  cefrLevel: 'A1',
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
});
