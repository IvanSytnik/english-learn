import { describe, expect, it } from 'vitest';

import {
  ANSWER_TEXT_MAX,
  ItemAttemptedPayloadSchema,
  LearnerBootstrappedPayloadSchema,
  PracticeModeSchema,
  VOCAB_VARIANT_MODE,
  VocabVariantValue,
} from '../learner-events';

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

describe('ItemAttemptedPayloadSchema — mode (V2)', () => {
  it('accepts a payload without mode (events written before the field)', () => {
    const res = ItemAttemptedPayloadSchema.safeParse(base);
    expect(res.success).toBe(true);
    expect(res.data).not.toHaveProperty('mode');
  });

  it.each(PracticeModeSchema.options)('accepts mode %s', (mode) => {
    const payload = { ...base, mode };
    expect(ItemAttemptedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('covers exactly recognition, recall and cloze', () => {
    expect(PracticeModeSchema.options).toEqual(['recognition', 'recall', 'cloze']);
  });

  it('rejects an unknown mode', () => {
    const res = ItemAttemptedPayloadSchema.safeParse({ ...base, mode: 'listening' });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['mode']);
  });

  it('is still strict about unknown keys next to mode', () => {
    const res = ItemAttemptedPayloadSchema.safeParse({ ...base, mode: 'recall', channel: 'web' });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.code).toBe('unrecognized_keys');
  });
});

describe('ItemAttemptedPayloadSchema — proof (B2.5)', () => {
  const proof = { ...base, correct: true, rating: 'EASY', mode: 'recall', proof: true } as const;

  it('accepts a passed proof: correct recall rated EASY', () => {
    expect(ItemAttemptedPayloadSchema.parse(proof)).toEqual(proof);
  });

  it('accepts a payload without proof (every earlier event)', () => {
    const res = ItemAttemptedPayloadSchema.safeParse({ ...base, mode: 'recall' });
    expect(res.success).toBe(true);
    expect(res.data).not.toHaveProperty('proof');
  });

  it('keeps the payload canonical: proof is either true or absent', () => {
    expect(ItemAttemptedPayloadSchema.safeParse({ ...proof, proof: false }).success).toBe(false);
  });

  it.each([
    ['an incorrect answer', { correct: false, rating: 'AGAIN' }],
    ['a rating other than EASY', { rating: 'GOOD' }],
    ['a recognition answer', { mode: 'recognition' }],
    ['a cloze answer', { mode: 'cloze' }],
    ['a payload without mode', { mode: undefined }],
    ['a hinted answer', { hinted: true }],
  ])('rejects a proof on %s', (_, patch) => {
    const res = ItemAttemptedPayloadSchema.safeParse({ ...proof, ...patch });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['proof']);
  });
});

describe('ItemAttemptedPayloadSchema — vocabulary analytics (B6.1)', () => {
  const vocab = {
    itemId: 'item.vocab.apple',
    conceptId: 'vocab.food_drink.a1',
    correct: false,
    timeMs: 2100,
    rating: 'AGAIN',
    irt: { a: 1, b: 0 },
  } as const;
  const wrongChoice = {
    ...vocab,
    mode: 'recognition',
    variant: 'l1_to_en',
    chosenItemId: 'item.vocab.pear',
    locale: 'ru',
  } as const;
  const typed = {
    ...vocab,
    mode: 'recall',
    variant: 'full_recall',
    answerText: 'appel',
    locale: 'de',
  } as const;
  const issuePath = (p: unknown) => ItemAttemptedPayloadSchema.safeParse(p).error?.issues[0]?.path;

  it('every payload shape written before B6.1 still parses, unchanged', () => {
    const before = [
      base,
      { ...base, dontKnow: true },
      { ...base, correct: true, rating: 'HARD', hinted: true },
      { ...vocab, mode: 'recognition' },
      { ...vocab, mode: 'cloze', dontKnow: true },
      { ...vocab, correct: true, rating: 'EASY', mode: 'recall', proof: true },
    ];
    for (const payload of before) {
      expect(ItemAttemptedPayloadSchema.parse(payload)).toEqual(payload);
    }
  });

  it('accepts a wrong choice with its distractor and a typed answer with its text', () => {
    expect(ItemAttemptedPayloadSchema.parse(wrongChoice)).toEqual(wrongChoice);
    expect(ItemAttemptedPayloadSchema.parse(typed)).toEqual(typed);
    const proof = {
      ...vocab,
      correct: true,
      rating: 'EASY',
      mode: 'recall',
      proof: true,
      variant: 'cued_recall',
      answerText: 'apple',
      locale: 'uk',
    };
    expect(ItemAttemptedPayloadSchema.parse(proof)).toEqual(proof);
  });

  it('variant needs its coarse mode — present and matching', () => {
    for (const variant of VocabVariantValue.options) {
      const mode = VOCAB_VARIANT_MODE[variant];
      expect(ItemAttemptedPayloadSchema.safeParse({ ...vocab, mode, variant }).success).toBe(true);
    }
    expect(issuePath({ ...vocab, variant: 'cloze' })).toEqual(['mode']);
    expect(issuePath({ ...vocab, mode: 'recall', variant: 'cloze' })).toEqual(['mode']);
    expect(issuePath({ ...vocab, mode: 'recognition', variant: 'full_recall' })).toEqual(['mode']);
    expect(
      ItemAttemptedPayloadSchema.safeParse({ ...vocab, mode: 'recall', variant: 'x' }).success,
    ).toBe(false);
  });

  it('a proof is a cued recall card', () => {
    const proof = { ...vocab, correct: true, rating: 'EASY', mode: 'recall', proof: true };
    expect(issuePath({ ...proof, variant: 'full_recall' })).toEqual(['variant']);
  });

  it('chosenItemId: only a wrong pick on a choice card, never the item itself', () => {
    expect(issuePath({ ...wrongChoice, correct: true, rating: 'GOOD' })).toEqual(['chosenItemId']);
    expect(issuePath({ ...wrongChoice, dontKnow: true })).toEqual(['chosenItemId']);
    expect(issuePath({ ...typed, chosenItemId: 'item.vocab.pear' })).toEqual(['chosenItemId']);
    const { variant: _, ...noVariant } = wrongChoice;
    expect(issuePath(noVariant)).toEqual(['chosenItemId']);
    expect(issuePath({ ...wrongChoice, chosenItemId: vocab.itemId })).toEqual(['chosenItemId']);
    expect(issuePath({ ...wrongChoice, chosenItemId: '' })).toEqual(['chosenItemId']);
  });

  it('answerText: typed cards only, never on don’t-know, at most ANSWER_TEXT_MAX', () => {
    expect(issuePath({ ...wrongChoice, chosenItemId: undefined, answerText: 'pear' })).toEqual([
      'answerText',
    ]);
    expect(issuePath({ ...typed, dontKnow: true })).toEqual(['answerText']);
    const { variant: _, ...noVariant } = typed;
    expect(issuePath(noVariant)).toEqual(['answerText']);
    expect(issuePath({ ...typed, answerText: '' })).toEqual(['answerText']);
    expect(ANSWER_TEXT_MAX).toBe(64);
    expect(
      ItemAttemptedPayloadSchema.safeParse({ ...typed, answerText: 'a'.repeat(64) }).success,
    ).toBe(true);
    expect(issuePath({ ...typed, answerText: 'a'.repeat(65) })).toEqual(['answerText']);
  });

  it('locale is one of ru / uk / de / en', () => {
    expect(issuePath({ ...typed, locale: 'fr' })).toEqual(['locale']);
  });

  it('grammar payloads are unaffected (no vocabulary field needed or added)', () => {
    const grammar = { ...base, correct: true, rating: 'GOOD', mode: 'cloze' } as const;
    expect(ItemAttemptedPayloadSchema.parse(grammar)).toEqual(grammar);
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
