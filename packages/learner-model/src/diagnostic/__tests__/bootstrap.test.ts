import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BktStateSchema } from '../../core/bkt/types';
import {
  buildBootstrapSnapshots,
  categoryToAxis,
  MAPPING_V1,
  mapAccuracyToPKnown,
} from '../bootstrap';
import type { AxisEstimate, BootstrapConcept } from '../types';

const fullAxis = (accuracy: number): AxisEstimate[] => [
  { axis: 'VOCAB', accuracy, answered: 10 },
  { axis: 'GRAMMAR', accuracy, answered: 10 },
  { axis: 'LISTENING', accuracy, answered: 10 },
];

describe('categoryToAxis', () => {
  it('maps GRAMMAR/VOCAB/LISTENING to their axes', () => {
    expect(categoryToAxis('GRAMMAR')).toBe('GRAMMAR');
    expect(categoryToAxis('VOCAB')).toBe('VOCAB');
    expect(categoryToAxis('LISTENING')).toBe('LISTENING');
  });

  it('leaves PHONETICS/DISCOURSE/PRAGMATICS on the prior (null)', () => {
    expect(categoryToAxis('PHONETICS')).toBeNull();
    expect(categoryToAxis('DISCOURSE')).toBeNull();
    expect(categoryToAxis('PRAGMATICS')).toBeNull();
  });
});

describe('mapAccuracyToPKnown', () => {
  it('never exceeds the ceiling, even at perfect accuracy', () => {
    const p = mapAccuracyToPKnown(1.0, 'B1', 'B1', MAPPING_V1);
    expect(p).toBeLessThanOrEqual(MAPPING_V1.ceiling);
    expect(p).toBeCloseTo(MAPPING_V1.ceiling, 10); // accuracy 1, at-level → hits ceiling
  });

  it('never drops below the floor, even at zero accuracy', () => {
    const p = mapAccuracyToPKnown(0, 'B1', 'B1', MAPPING_V1);
    expect(p).toBe(MAPPING_V1.floor);
  });

  it('discounts concepts above the assessed level', () => {
    const atLevel = mapAccuracyToPKnown(1.0, 'B1', 'B1', MAPPING_V1);
    const aboveLevel = mapAccuracyToPKnown(1.0, 'C1', 'B1', MAPPING_V1);
    expect(aboveLevel).toBeLessThan(atLevel);
  });

  it('stays within [floor, ceiling] for any accuracy/level combo', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(...levels),
        fc.constantFrom(...levels),
        (acc, cl, al) => {
          const p = mapAccuracyToPKnown(acc, cl, al, MAPPING_V1);
          expect(p).toBeGreaterThanOrEqual(MAPPING_V1.floor);
          expect(p).toBeLessThanOrEqual(MAPPING_V1.ceiling);
        },
      ),
    );
  });

  it('is monotonic non-decreasing in accuracy at a fixed level', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a1, a2) => {
          const lo = Math.min(a1, a2);
          const hi = Math.max(a1, a2);
          const pLo = mapAccuracyToPKnown(lo, 'B1', 'B1', MAPPING_V1);
          const pHi = mapAccuracyToPKnown(hi, 'B1', 'B1', MAPPING_V1);
          expect(pHi).toBeGreaterThanOrEqual(pLo - 1e-12);
        },
      ),
    );
  });
});

describe('buildBootstrapSnapshots', () => {
  const concepts: BootstrapConcept[] = [
    { id: 'grammar.present_perfect', category: 'GRAMMAR', cefrLevel: 'B1' },
    { id: 'vocab.travel', category: 'VOCAB', cefrLevel: 'A2' },
    { id: 'phon.stress', category: 'PHONETICS', cefrLevel: 'B1' }, // no axis
  ];

  it('produces a full, schema-valid BKT snapshot for measured concepts', () => {
    const { snapshots } = buildBootstrapSnapshots({
      concepts,
      axes: fullAxis(0.8),
      assessedLevel: 'B1',
    });

    // grammar + vocab measured; phonetics skipped
    expect(snapshots.map((s) => s.conceptId).sort()).toEqual([
      'grammar.present_perfect',
      'vocab.travel',
    ]);

    for (const s of snapshots) {
      // Reconstruct a BktState the way fold will and validate it.
      const asState = {
        pKnown: s.pKnown,
        pLearn: s.pLearn,
        pSlip: s.pSlip,
        pGuess: s.pGuess,
        pForgetLambda: s.pForgetLambda,
        lastUpdatedAt: 0,
        observationCount: 0,
      };
      expect(() => BktStateSchema.parse(asState)).not.toThrow();
      expect(s.sourceAxis).not.toBeNull();
    }
  });

  it('skips no-axis concepts with reason no_axis (decision 6.a)', () => {
    const { skipped } = buildBootstrapSnapshots({
      concepts,
      axes: fullAxis(0.8),
      assessedLevel: 'B1',
    });
    expect(skipped).toContainEqual({ conceptId: 'phon.stress', reason: 'no_axis' });
  });

  it('skips concepts whose axis is below minAnswersPerAxis (R4 sparse guard)', () => {
    const sparseAxes: AxisEstimate[] = [
      { axis: 'VOCAB', accuracy: 1, answered: 1 }, // below threshold (3)
      { axis: 'GRAMMAR', accuracy: 1, answered: 10 },
      { axis: 'LISTENING', accuracy: 0, answered: 0 },
    ];
    const { snapshots, skipped } = buildBootstrapSnapshots({
      concepts,
      axes: sparseAxes,
      assessedLevel: 'B1',
    });

    expect(snapshots.map((s) => s.conceptId)).toEqual(['grammar.present_perfect']);
    expect(skipped).toContainEqual({ conceptId: 'vocab.travel', reason: 'sparse_axis' });
  });

  it('a stronger axis yields a higher pKnown for its concepts', () => {
    const weak = buildBootstrapSnapshots({
      concepts,
      axes: fullAxis(0.2),
      assessedLevel: 'B1',
    }).snapshots.find((s) => s.conceptId === 'grammar.present_perfect')!;

    const strong = buildBootstrapSnapshots({
      concepts,
      axes: fullAxis(0.9),
      assessedLevel: 'B1',
    }).snapshots.find((s) => s.conceptId === 'grammar.present_perfect')!;

    expect(strong.pKnown).toBeGreaterThan(weak.pKnown);
  });
});
