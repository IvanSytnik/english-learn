import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accuracyBasedEstimator, ladderEstimator } from '../theta-estimator';
import type { DiagnosticAnswerFact } from '../types';

/** The accuracy estimator reads neither field; give every fact the same. */
type RawFact = Omit<DiagnosticAnswerFact, 'itemLevel' | 'position'>;
const estimateAccuracy = (facts: RawFact[]) =>
  accuracyBasedEstimator.estimate(
    facts.map((f, position) => ({ itemLevel: 'B1' as const, position, ...f })),
  );

describe('accuracyBasedEstimator', () => {
  it('returns an entry for every axis, even with no answers', () => {
    const out = estimateAccuracy([]);
    const axes = out.map((e) => e.axis).sort();
    expect(axes).toEqual(['GRAMMAR', 'LISTENING', 'VOCAB']);
    for (const e of out) {
      expect(e.answered).toBe(0);
      expect(e.score).toBe(0);
    }
  });

  it('computes per-axis score (fraction correct) independently', () => {
    const answers: RawFact[] = [
      { axis: 'VOCAB', correct: true },
      { axis: 'VOCAB', correct: true },
      { axis: 'VOCAB', correct: false }, // vocab 2/3
      { axis: 'GRAMMAR', correct: false },
      { axis: 'GRAMMAR', correct: false }, // grammar 0/2
    ];
    const byAxis = new Map(estimateAccuracy(answers).map((e) => [e.axis, e]));

    expect(byAxis.get('VOCAB')).toMatchObject({ answered: 3 });
    expect(byAxis.get('VOCAB')!.score).toBeCloseTo(2 / 3, 10);
    expect(byAxis.get('GRAMMAR')).toMatchObject({ answered: 2, score: 0 });
    expect(byAxis.get('LISTENING')).toMatchObject({ answered: 0, score: 0 });
  });

  it('score is always in [0,1] and monotonic in correct answers', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }), (bools) => {
        const answers: RawFact[] = bools.map((correct) => ({
          axis: 'GRAMMAR' as const,
          correct,
        }));
        const est = estimateAccuracy(answers).find((e) => e.axis === 'GRAMMAR')!;

        expect(est.score).toBeGreaterThanOrEqual(0);
        expect(est.score).toBeLessThanOrEqual(1);
        expect(est.answered).toBe(bools.length);

        const expected = bools.filter(Boolean).length / bools.length;
        expect(est.score).toBeCloseTo(expected, 10);
      }),
    );
  });

  it('flipping any answer to correct never decreases the score', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (bools, idxRaw) => {
          const idx = idxRaw % bools.length;
          const mk = (bs: boolean[]): RawFact[] =>
            bs.map((correct) => ({ axis: 'VOCAB' as const, correct }));

          const before = estimateAccuracy(mk(bools)).find((e) => e.axis === 'VOCAB')!.score;

          const flipped = [...bools];
          flipped[idx] = true;
          const after = estimateAccuracy(mk(flipped)).find((e) => e.axis === 'VOCAB')!.score;

          expect(after).toBeGreaterThanOrEqual(before - 1e-12);
        },
      ),
    );
  });

  it("scores don't-know as answered but incorrect, even if mis-flagged correct", () => {
    const answers: RawFact[] = [
      { axis: 'GRAMMAR', correct: true },
      { axis: 'GRAMMAR', correct: false, dontKnow: true },
      { axis: 'GRAMMAR', correct: true, dontKnow: true }, // DB CHECK forbids; estimator still safe
    ];
    const est = estimateAccuracy(answers).find((e) => e.axis === 'GRAMMAR');
    expect(est?.answered).toBe(3);
    expect(est?.score).toBeCloseTo(1 / 3, 10);
  });

  it("marking answers don't-know is equivalent to marking them incorrect", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ correct: fc.boolean(), dontKnow: fc.boolean() }), {
          minLength: 1,
          maxLength: 40,
        }),
        (rows) => {
          const withFlag: RawFact[] = rows.map((r) => ({
            axis: 'VOCAB' as const,
            correct: r.correct,
            dontKnow: r.dontKnow,
          }));
          const asIncorrect: RawFact[] = rows.map((r) => ({
            axis: 'VOCAB' as const,
            correct: r.correct && !r.dontKnow,
          }));
          expect(estimateAccuracy(withFlag)).toEqual(estimateAccuracy(asIncorrect));
        },
      ),
    );
  });
});

describe('ladderEstimator', () => {
  const fact = (
    axis: DiagnosticAnswerFact['axis'],
    position: number,
    itemLevel: DiagnosticAnswerFact['itemLevel'],
    correct = true,
  ): DiagnosticAnswerFact => ({ axis, position, itemLevel, correct });

  it('scores each axis by its level: rank / 4 (A2 0.25 … C1 1.0), level frozen alongside', () => {
    const answers = [
      ...['A2', 'A2', 'A2', 'A2'].map((l, i) => fact('VOCAB', i * 2 + 1, l as 'A2')),
      ...['C1', 'C1', 'C1', 'C1'].map((l, i) => fact('GRAMMAR', i * 2, l as 'C1')),
    ];
    expect(ladderEstimator.estimate(answers)).toEqual([
      { axis: 'VOCAB', score: 0.25, answered: 4, level: 'A2' },
      { axis: 'GRAMMAR', score: 1, answered: 4, level: 'C1' },
      { axis: 'LISTENING', score: 0, answered: 0, level: null },
    ]);
  });

  it('uses the last four answers by position, whatever order they arrive in', () => {
    // Positions 0..10 on GRAMMAR: early B1/B2, last four B2, B2, C1, C1 → 3.5 → B2.
    const levels = ['B1', 'B1', 'B2', 'B2', 'C1', 'C1'] as const;
    const answers = levels.map((l, i) => fact('GRAMMAR', i * 2, l)).reverse();
    expect(ladderEstimator.estimate(answers).find((e) => e.axis === 'GRAMMAR')).toEqual({
      axis: 'GRAMMAR',
      score: 0.75,
      answered: 6,
      level: 'B2',
    });
  });

  it('correctness moves the ladder, not the score: same questions, same score', () => {
    const right = [0, 2, 4, 6].map((p) => fact('GRAMMAR', p, 'B1', true));
    const wrong = right.map((a) => ({ ...a, correct: false }));
    expect(ladderEstimator.estimate(wrong)).toEqual(ladderEstimator.estimate(right));
  });
});
