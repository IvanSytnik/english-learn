import { describe, expect, it } from 'vitest';

import { ItemAttemptedPayloadSchema } from '../learner-events';

const base = {
  itemId: 'item.past_simple.regular_ed',
  conceptId: 'grammar.past_simple',
  correct: false,
  timeMs: 4200,
  rating: 'AGAIN',
  irt: { a: 1.3, b: -0.5 },
} as const;

describe('ItemAttemptedPayloadSchema — dontKnow', () => {
  it('accepts a payload written before the field existed (replay compatibility)', () => {
    expect(ItemAttemptedPayloadSchema.parse(base)).toEqual(base);
  });

  it('accepts a don’t-know attempt graded incorrect', () => {
    const payload = { ...base, dontKnow: true };
    expect(ItemAttemptedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a don’t-know attempt graded correct', () => {
    const res = ItemAttemptedPayloadSchema.safeParse({
      ...base,
      correct: true,
      rating: 'GOOD',
      dontKnow: true,
    });
    expect(res.success).toBe(false);
  });

  it('keeps the payload canonical: dontKnow is either true or absent', () => {
    expect(ItemAttemptedPayloadSchema.safeParse({ ...base, dontKnow: false }).success).toBe(false);
  });

  it('is still strict about unknown keys', () => {
    expect(ItemAttemptedPayloadSchema.safeParse({ ...base, skipped: true }).success).toBe(false);
  });
});
