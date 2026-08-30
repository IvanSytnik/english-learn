import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accuracyBasedEstimator } from '../theta-estimator';
import type { DiagnosticAnswerFact } from '../types';

describe('accuracyBasedEstimator', () => {
  it('returns an entry for every axis, even with no answers', () => {
    const out = accuracyBasedEstimator.estimate([]);
    const axes = out.map((e) => e.axis).sort();
    expect(axes).toEqual(['GRAMMAR', 'LISTENING', 'VOCAB']);
    for (const e of out) {
      expect(e.answered).toBe(0);
      expect(e.accuracy).toBe(0);
    }
  });

  it('computes per-axis accuracy independently', () => {
    const answers: DiagnosticAnswerFact[] = [
      { axis: 'VOCAB', correct: true },
      { axis: 'VOCAB', correct: true },
      { axis: 'VOCAB', correct: false }, // vocab 2/3
      { axis: 'GRAMMAR', correct: false },
      { axis: 'GRAMMAR', correct: false }, // grammar 0/2
    ];
    const byAxis = new Map(accuracyBasedEstimator.estimate(answers).map((e) => [e.axis, e]));

    expect(byAxis.get('VOCAB')).toMatchObject({ answered: 3 });
    expect(byAxis.get('VOCAB')!.accuracy).toBeCloseTo(2 / 3, 10);
    expect(byAxis.get('GRAMMAR')).toMatchObject({ answered: 2, accuracy: 0 });
    expect(byAxis.get('LISTENING')).toMatchObject({ answered: 0, accuracy: 0 });
  });

  it('accuracy is always in [0,1] and monotonic in correct answers', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
        (bools) => {
          const answers: DiagnosticAnswerFact[] = bools.map((correct) => ({
            axis: 'GRAMMAR' as const,
            correct,
          }));
          const est = accuracyBasedEstimator
            .estimate(answers)
            .find((e) => e.axis === 'GRAMMAR')!;

          expect(est.accuracy).toBeGreaterThanOrEqual(0);
          expect(est.accuracy).toBeLessThanOrEqual(1);
          expect(est.answered).toBe(bools.length);

          const expected = bools.filter(Boolean).length / bools.length;
          expect(est.accuracy).toBeCloseTo(expected, 10);
        },
      ),
    );
  });

  it('flipping any answer to correct never decreases accuracy', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (bools, idxRaw) => {
          const idx = idxRaw % bools.length;
          const mk = (bs: boolean[]): DiagnosticAnswerFact[] =>
            bs.map((correct) => ({ axis: 'VOCAB' as const, correct }));

          const before = accuracyBasedEstimator
            .estimate(mk(bools))
            .find((e) => e.axis === 'VOCAB')!.accuracy;

          const flipped = [...bools];
          flipped[idx] = true;
          const after = accuracyBasedEstimator
            .estimate(mk(flipped))
            .find((e) => e.axis === 'VOCAB')!.accuracy;

          expect(after).toBeGreaterThanOrEqual(before - 1e-12);
        },
      ),
    );
  });
});
