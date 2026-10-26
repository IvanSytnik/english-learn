import { PRACTICE_GAP, safeParseItemContent } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { ALL_ITEMS } from '../../seed/items';
import { ITEM_PRACTICE } from '../../seed/items/practice';

describe('seed item practice (U2)', () => {
  it('every seed item has a practice question that validates with its kind schema', () => {
    expect(ALL_ITEMS).toHaveLength(92);
    for (const item of ALL_ITEMS) {
      const parsed = safeParseItemContent(item.kind, item.content);
      expect(parsed.success, item.id).toBe(true);
      expect(parsed.success && parsed.data.practice, item.id).toBeTruthy();
    }
  });

  it('has no practice for unknown items', () => {
    const ids = new Set(ALL_ITEMS.map((i) => i.id));
    expect(Object.keys(ITEM_PRACTICE).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every prompt shows exactly one gap', () => {
    for (const [id, p] of Object.entries(ITEM_PRACTICE)) {
      expect(p.prompt.split(PRACTICE_GAP).length, id).toBe(2);
    }
  });

  it('spreads the correct choice across positions (no positional tell)', () => {
    const counts = new Map<number, number>();
    for (const p of Object.values(ITEM_PRACTICE)) {
      if (p.type === 'choice') counts.set(p.correctIndex, (counts.get(p.correctIndex) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const n of counts.values()) expect(n / total).toBeLessThan(0.4);
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });
});
