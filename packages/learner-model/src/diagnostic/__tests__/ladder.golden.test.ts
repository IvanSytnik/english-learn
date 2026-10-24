import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_BANK } from '../../../seed/diagnostic/bank';
import { type LadderAnswer, type LadderStep, nextLadderStep } from '../ladder';

/**
 * Golden trajectories: full attempts over the real bank, step by step
 * (ladder target + question served) and the final levels. The expected
 * values were computed by the ladder as of 11fa2ef, before the assessed-level
 * formula moved into `ladderAssessedLevel` — they pin today's behaviour, so
 * any change to what a learner is asked or placed at fails here.
 *
 * A deliberate change to the bank or the ladder rules regenerates these.
 * R = right, W = wrong, D = don't know; position i answers seq[i].
 */

const POOL = DIAGNOSTIC_BANK.map((b) => ({ id: b.id, axis: b.kind, cefrLevel: b.cefrLevel }));

function play(seq: string): { path: string[]; last: LadderStep } {
  const answers: LadderAnswer[] = [];
  const path: string[] = [];
  for (;;) {
    const step = nextLadderStep({ attemptId: 'golden-attempt', answers, pool: POOL });
    if (step.kind !== 'question') return { path, last: step };
    const item = POOL.find((p) => p.id === step.itemId);
    if (!item) throw new Error(`unknown item ${step.itemId}`);
    path.push(`${step.targetLevel} ${step.itemId}`);
    answers.push({
      position: step.position,
      axis: step.axis,
      itemId: step.itemId,
      itemLevel: item.cefrLevel,
      correct: seq[step.position] === 'R',
      dontKnow: seq[step.position] === 'D',
    });
  }
}

const GOLDEN: Record<string, { seq: string; path: string[]; last: LadderStep }> = {
  allRight: {
    seq: 'RRRRRRRRRRRRRRRR',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'B2 seed-diag-grammar-b2-03',
      'B2 seed-diag-vocab-b2-04',
      'B2 seed-diag-grammar-b2-02',
      'B2 seed-diag-vocab-b2-03',
      'C1 seed-diag-grammar-c1-02',
      'C1 seed-diag-vocab-c1-04',
      'C1 seed-diag-grammar-c1-04',
      'C1 seed-diag-vocab-c1-06',
      'C1 seed-diag-grammar-c1-03',
      'C1 seed-diag-vocab-c1-03',
      'C1 seed-diag-grammar-c1-01',
      'C1 seed-diag-vocab-c1-05',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'C1' },
        { axis: 'VOCAB', level: 'C1' },
      ],
      assessedLevel: 'C1',
    },
  },
  allWrong: {
    seq: 'WWWWWWWWWWWWWWWW',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'A2 seed-diag-grammar-a2-03',
      'A2 seed-diag-vocab-a2-04',
      'A2 seed-diag-grammar-a2-02',
      'A2 seed-diag-vocab-a2-03',
      'A2 seed-diag-grammar-a2-04',
      'A2 seed-diag-vocab-a2-05',
      'A2 seed-diag-grammar-a2-05',
      'A2 seed-diag-vocab-a2-06',
      'A2 seed-diag-grammar-a2-01',
      'A2 seed-diag-vocab-a2-02',
      'A2 seed-diag-grammar-a2-06',
      'A2 seed-diag-vocab-a2-01',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'A2' },
        { axis: 'VOCAB', level: 'A2' },
      ],
      assessedLevel: 'A2',
    },
  },
  allDontKnow: {
    seq: 'DDDDDDDDDDDDDDDD',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'A2 seed-diag-grammar-a2-03',
      'A2 seed-diag-vocab-a2-04',
      'A2 seed-diag-grammar-a2-02',
      'A2 seed-diag-vocab-a2-03',
      'A2 seed-diag-grammar-a2-04',
      'A2 seed-diag-vocab-a2-05',
      'A2 seed-diag-grammar-a2-05',
      'A2 seed-diag-vocab-a2-06',
      'A2 seed-diag-grammar-a2-01',
      'A2 seed-diag-vocab-a2-02',
      'A2 seed-diag-grammar-a2-06',
      'A2 seed-diag-vocab-a2-01',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'A2' },
        { axis: 'VOCAB', level: 'A2' },
      ],
      assessedLevel: 'A2',
    },
  },
  grammarRightVocabWrong: {
    seq: 'RWRWRWRWRWRWRWRW',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'B2 seed-diag-grammar-b2-03',
      'A2 seed-diag-vocab-a2-04',
      'B2 seed-diag-grammar-b2-02',
      'A2 seed-diag-vocab-a2-03',
      'C1 seed-diag-grammar-c1-02',
      'A2 seed-diag-vocab-a2-05',
      'C1 seed-diag-grammar-c1-04',
      'A2 seed-diag-vocab-a2-06',
      'C1 seed-diag-grammar-c1-03',
      'A2 seed-diag-vocab-a2-02',
      'C1 seed-diag-grammar-c1-01',
      'A2 seed-diag-vocab-a2-01',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'C1' },
        { axis: 'VOCAB', level: 'A2' },
      ],
      assessedLevel: 'B1',
    },
  },
  pairsAlternating: {
    seq: 'RRWWRRWWRRWWRRWW',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'B1 seed-diag-grammar-b1-04',
      'B1 seed-diag-vocab-b1-06',
      'B1 seed-diag-grammar-b1-03',
      'B1 seed-diag-vocab-b1-04',
      'B1 seed-diag-grammar-b1-05',
      'B1 seed-diag-vocab-b1-07',
      'B1 seed-diag-grammar-b1-06',
      'B1 seed-diag-vocab-b1-08',
      'B1 seed-diag-grammar-b1-01',
      'B1 seed-diag-vocab-b1-02',
      'B1 seed-diag-grammar-b1-08',
      'B1 seed-diag-vocab-b1-01',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'B1' },
        { axis: 'VOCAB', level: 'B1' },
      ],
      assessedLevel: 'B1',
    },
  },
  climbThenFall: {
    seq: 'RRRRRRRRWWWWWWWW',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'B2 seed-diag-grammar-b2-03',
      'B2 seed-diag-vocab-b2-04',
      'B2 seed-diag-grammar-b2-02',
      'B2 seed-diag-vocab-b2-03',
      'C1 seed-diag-grammar-c1-02',
      'C1 seed-diag-vocab-c1-04',
      'C1 seed-diag-grammar-c1-04',
      'C1 seed-diag-vocab-c1-06',
      'B2 seed-diag-grammar-b2-04',
      'B2 seed-diag-vocab-b2-05',
      'B2 seed-diag-grammar-b2-01',
      'B2 seed-diag-vocab-b2-06',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'B2' },
        { axis: 'VOCAB', level: 'B2' },
      ],
      assessedLevel: 'B2',
    },
  },
  mixedWithDontKnow: {
    seq: 'RDRWWRDDRRWRDWRR',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'B2 seed-diag-grammar-b2-03',
      'A2 seed-diag-vocab-a2-04',
      'B2 seed-diag-grammar-b2-02',
      'A2 seed-diag-vocab-a2-03',
      'B1 seed-diag-grammar-b1-03',
      'A2 seed-diag-vocab-a2-05',
      'B1 seed-diag-grammar-b1-05',
      'A2 seed-diag-vocab-a2-06',
      'B1 seed-diag-grammar-b1-04',
      'B1 seed-diag-vocab-b1-06',
      'A2 seed-diag-grammar-a2-01',
      'B1 seed-diag-vocab-b1-07',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'A2' },
        { axis: 'VOCAB', level: 'A2' },
      ],
      assessedLevel: 'A2',
    },
  },
  fallThenClimb: {
    seq: 'WDWWDWRRRRRRRRRR',
    path: [
      'B1 seed-diag-grammar-b1-07',
      'B1 seed-diag-vocab-b1-05',
      'B1 seed-diag-grammar-b1-02',
      'B1 seed-diag-vocab-b1-03',
      'A2 seed-diag-grammar-a2-03',
      'A2 seed-diag-vocab-a2-04',
      'A2 seed-diag-grammar-a2-02',
      'A2 seed-diag-vocab-a2-03',
      'A2 seed-diag-grammar-a2-04',
      'A2 seed-diag-vocab-a2-05',
      'B1 seed-diag-grammar-b1-05',
      'B1 seed-diag-vocab-b1-08',
      'B1 seed-diag-grammar-b1-04',
      'B1 seed-diag-vocab-b1-04',
      'B2 seed-diag-grammar-b2-01',
      'B2 seed-diag-vocab-b2-05',
    ],
    last: {
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'B1' },
        { axis: 'VOCAB', level: 'B1' },
      ],
      assessedLevel: 'B1',
    },
  },
};

describe('nextLadderStep — golden trajectories over the real bank', () => {
  for (const [name, golden] of Object.entries(GOLDEN)) {
    it(name, () => {
      expect(play(golden.seq)).toEqual({ path: golden.path, last: golden.last });
    });
  }
});
