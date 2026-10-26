import { describe, expect, it } from 'vitest';

import { ItemAttemptedPayloadSchema, LearnerBootstrappedPayloadSchema } from '../learner-events';

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

describe('ItemAttemptedPayloadSchema — hinted', () => {
  it('accepts a correct hinted attempt rated HARD', () => {
    const payload = { ...base, correct: true, rating: 'HARD', hinted: true };
    expect(ItemAttemptedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('accepts the hint next to an incorrect or don’t-know attempt', () => {
    const payload = { ...base, dontKnow: true, hinted: true };
    expect(ItemAttemptedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('keeps the payload canonical: hinted is either true or absent', () => {
    expect(ItemAttemptedPayloadSchema.safeParse({ ...base, hinted: false }).success).toBe(false);
  });
});

describe('LearnerBootstrappedPayloadSchema — ladder axes carry their level', () => {
  const payload = (axes: unknown[], estimator?: 'accuracy' | 'ladder') => ({
    diagnosticAttemptId: 'da1',
    assessedLevel: 'B1',
    ...(estimator ? { estimator } : {}),
    axes,
    formulaVersion: 'v1',
    mappingConstants: { floor: 0.15, ceiling: 0.6, aboveLevelFactor: 0.5, minAnswersPerAxis: 3 },
    snapshots: [
      {
        conceptId: 'grammar.past_simple',
        pKnown: 0.6,
        pLearn: 0.1,
        pSlip: 0.1,
        pGuess: 0.2,
        pForgetLambda: 0,
        sourceAxis: 'GRAMMAR',
      },
    ],
  });
  const grammarC1 = { axis: 'GRAMMAR', score: 1, answered: 8, level: 'C1' };
  const listeningNone = { axis: 'LISTENING', score: 0, answered: 0 };

  it('accepts a ladder payload whose answered axes have a level', () => {
    const r = LearnerBootstrappedPayloadSchema.safeParse(
      payload([grammarC1, listeningNone], 'ladder'),
    );
    expect(r.success).toBe(true);
  });

  it('rejects a ladder payload with an answered axis missing its level', () => {
    const { level: _, ...noLevel } = grammarC1;
    const r = LearnerBootstrappedPayloadSchema.safeParse(payload([noLevel], 'ladder'));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['axes', 0, 'level']);
  });

  it('does not require levels from the accuracy estimator or legacy payloads', () => {
    const accuracy = { axis: 'GRAMMAR', score: 0.75, answered: 8 };
    expect(
      LearnerBootstrappedPayloadSchema.safeParse(payload([accuracy], 'accuracy')).success,
    ).toBe(true);
    expect(LearnerBootstrappedPayloadSchema.safeParse(payload([accuracy])).success).toBe(true);
  });
});
