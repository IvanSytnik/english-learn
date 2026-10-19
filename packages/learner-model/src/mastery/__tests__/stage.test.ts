import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY_CONFIG } from '../../policy/types';
import {
  computeEffectiveStage,
  isFading,
  MASTERY_STAGES,
  type MasteryStage,
  nextDisplayStage,
  STAGE_THRESHOLDS,
} from '../stage';

const rank = (s: MasteryStage) => MASTERY_STAGES.indexOf(s);
const stageArb = fc.constantFrom(...MASTERY_STAGES);
const pArb = fc.double({ min: 0, max: 1, noNaN: true });

describe('nextDisplayStage — upgrades', () => {
  it.each([
    [0.1, 'EMERGING'],
    [0.39, 'EMERGING'],
    [0.4, 'DEVELOPING'],
    [0.69, 'DEVELOPING'],
    [0.7, 'SOLID'],
    [0.89, 'SOLID'],
    [0.9, 'HIGH_SOLID'],
  ] as const)('from NOT_STARTED at pKnown %s -> %s', (p, expected) => {
    expect(nextDisplayStage('NOT_STARTED', p)).toBe(expected);
  });

  it('upgrades immediately and may skip levels', () => {
    expect(nextDisplayStage('EMERGING', 0.95)).toBe('HIGH_SOLID');
  });

  it('SOLID entry threshold equals the prereq gate', () => {
    expect(STAGE_THRESHOLDS.SOLID).toBe(DEFAULT_POLICY_CONFIG.prereqThreshold);
  });
});

describe('nextDisplayStage — downgrade hysteresis (-0.05)', () => {
  it.each([
    ['SOLID', 0.66, 'SOLID'],
    ['SOLID', 0.64, 'DEVELOPING'],
    ['DEVELOPING', 0.36, 'DEVELOPING'],
    ['DEVELOPING', 0.34, 'EMERGING'],
    ['HIGH_SOLID', 0.86, 'HIGH_SOLID'],
    ['HIGH_SOLID', 0.84, 'SOLID'],
    ['HIGH_SOLID', 0.5, 'DEVELOPING'],
    ['SOLID', 0.2, 'EMERGING'],
  ] as const)('%s at pKnown %s -> %s', (prev, p, expected) => {
    expect(nextDisplayStage(prev, p)).toBe(expected);
  });
});

describe('nextDisplayStage — properties', () => {
  it('an observed concept never returns to NOT_STARTED', () => {
    fc.assert(
      fc.property(stageArb, pArb, (prev, p) => {
        expect(nextDisplayStage(prev, p)).not.toBe('NOT_STARTED');
      }),
    );
  });

  it('is idempotent: re-applying the same pKnown keeps the stage', () => {
    fc.assert(
      fc.property(stageArb, pArb, (prev, p) => {
        const once = nextDisplayStage(prev, p);
        expect(nextDisplayStage(once, p)).toBe(once);
      }),
    );
  });

  it('never downgrades unless pKnown is below the entry threshold minus 0.05', () => {
    const entry: Partial<Record<MasteryStage, number>> = {
      DEVELOPING: STAGE_THRESHOLDS.DEVELOPING,
      SOLID: STAGE_THRESHOLDS.SOLID,
      HIGH_SOLID: STAGE_THRESHOLDS.HIGH_SOLID,
    };
    fc.assert(
      fc.property(stageArb, pArb, (prev, p) => {
        const next = nextDisplayStage(prev, p);
        const t = entry[prev];
        if (rank(next) < rank(prev) && t !== undefined) {
          expect(p).toBeLessThan(t - 0.05);
        }
      }),
    );
  });

  it('is monotonic in pKnown for a fixed previous stage', () => {
    fc.assert(
      fc.property(stageArb, pArb, pArb, (prev, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(rank(nextDisplayStage(prev, lo))).toBeLessThanOrEqual(
          rank(nextDisplayStage(prev, hi)),
        );
      }),
    );
  });
});

describe('computeEffectiveStage', () => {
  it('shows HIGH_SOLID as SECURE only when median stability > 21 d', () => {
    expect(computeEffectiveStage('HIGH_SOLID', [30, 25, 2])).toBe('SECURE'); // median 25
    expect(computeEffectiveStage('HIGH_SOLID', [21, 21])).toBe('SOLID'); // not > 21
    expect(computeEffectiveStage('HIGH_SOLID', [10, 40])).toBe('SECURE'); // median 25
    expect(computeEffectiveStage('HIGH_SOLID', [1, 2, 40])).toBe('SOLID'); // median 2
  });

  it('shows HIGH_SOLID as SOLID with no reviewed items', () => {
    expect(computeEffectiveStage('HIGH_SOLID', [])).toBe('SOLID');
  });

  it('passes every other stage through, regardless of stability', () => {
    for (const s of ['NOT_STARTED', 'EMERGING', 'DEVELOPING', 'SOLID'] as const) {
      expect(computeEffectiveStage(s, [100, 100])).toBe(s);
    }
  });
});

describe('isFading', () => {
  it('is true when any reviewed item is due, including exactly now', () => {
    expect(isFading([2000, 1000], 1000)).toBe(true);
    expect(isFading([2000, 3000], 1000)).toBe(false);
    expect(isFading([], 1000)).toBe(false);
  });
});
