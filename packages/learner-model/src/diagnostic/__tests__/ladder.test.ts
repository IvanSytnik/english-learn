import type { CefrLevelValue } from '@englishlearn/db/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LADDER_AXES,
  LADDER_LEVELS,
  type LadderAnswer,
  type LadderPoolItem,
  type LadderStep,
  ladderAxisLevel,
  ladderLevel,
  nextLadderStep,
  TOTAL_QUESTIONS,
} from '../ladder';

/** The planned bank: 2 axes × A2..C1 × 6. */
const BANK: LadderPoolItem[] = LADDER_AXES.flatMap((axis) =>
  LADDER_LEVELS.flatMap((level) =>
    Array.from({ length: 6 }, (_, i) => ({
      id: `diag-${axis.toLowerCase()}-${level.toLowerCase()}-${String(i + 1).padStart(2, '0')}`,
      axis,
      cefrLevel: level,
    })),
  ),
);
const levelOf = new Map(BANK.map((p) => [p.id, p.cefrLevel]));

type Verdict = 'right' | 'wrong' | 'dontKnow';

/** Runs an attempt to the end; `verdict(position)` answers each question. */
function run(verdict: (position: number) => Verdict, pool = BANK, attemptId = 'att-1') {
  const answers: LadderAnswer[] = [];
  const steps: LadderStep[] = [];
  for (;;) {
    const step = nextLadderStep({ attemptId, answers, pool });
    steps.push(step);
    if (step.kind !== 'question') return { answers, steps, last: step };
    const v = verdict(step.position);
    answers.push({
      position: step.position,
      axis: step.axis,
      itemId: step.itemId,
      itemLevel: pool.find((p) => p.id === step.itemId)?.cefrLevel as CefrLevelValue,
      correct: v === 'right',
      dontKnow: v === 'dontKnow',
    });
  }
}

const verdicts = fc.array(fc.constantFrom<Verdict>('right', 'wrong', 'dontKnow'), {
  minLength: TOTAL_QUESTIONS,
  maxLength: TOTAL_QUESTIONS,
});

const answer = (position: number, itemLevel: CefrLevelValue, ok: boolean): LadderAnswer => ({
  position,
  axis: position % 2 === 0 ? 'GRAMMAR' : 'VOCAB',
  itemId: `i${position}`,
  itemLevel,
  correct: ok,
  dontKnow: false,
});

describe('nextLadderStep — properties', () => {
  it('serves exactly 16 distinct questions, axis by parity, ladder within A2..C1', () => {
    fc.assert(
      fc.property(verdicts, fc.string(), (vs, attemptId) => {
        const { answers, last } = run((p) => vs[p] as Verdict, BANK, attemptId);
        expect(last.kind).toBe('complete');
        expect(answers).toHaveLength(TOTAL_QUESTIONS);
        expect(new Set(answers.map((a) => a.itemId)).size).toBe(TOTAL_QUESTIONS);
        for (const a of answers) {
          expect(a.axis).toBe(a.position % 2 === 0 ? 'GRAMMAR' : 'VOCAB');
          expect(BANK.find((p) => p.id === a.itemId)?.axis).toBe(a.axis);
        }
      }),
    );
  });

  it('targetLevel always stays on the ladder', () => {
    fc.assert(
      fc.property(verdicts, (vs) => {
        for (const step of run((p) => vs[p] as Verdict).steps) {
          if (step.kind === 'question') expect(LADDER_LEVELS).toContain(step.targetLevel);
        }
      }),
    );
  });

  it('is deterministic, whatever order the pool arrives in', () => {
    fc.assert(
      fc.property(
        verdicts,
        fc.integer({ min: 0, max: TOTAL_QUESTIONS - 1 }),
        fc.shuffledSubarray(BANK, { minLength: BANK.length }),
        (vs, k, shuffled) => {
          const { answers } = run((p) => vs[p] as Verdict);
          const prefix = answers.slice(0, k);
          const a = nextLadderStep({ attemptId: 'att-1', answers: prefix, pool: BANK });
          const b = nextLadderStep({ attemptId: 'att-1', answers: prefix, pool: shuffled });
          expect(b).toEqual(a);
        },
      ),
    );
  });

  it('prefix replay: the next step depends only on the answers so far, not on their order', () => {
    fc.assert(
      fc.property(verdicts, fc.integer({ min: 0, max: TOTAL_QUESTIONS }), (vs, k) => {
        const { answers, steps } = run((p) => vs[p] as Verdict);
        const reordered = [...answers.slice(0, k)].reverse();
        expect(nextLadderStep({ attemptId: 'att-1', answers: reordered, pool: BANK })).toEqual(
          steps[k],
        );
      }),
    );
  });
});

describe('nextLadderStep — scenarios', () => {
  it('all right → C1 on both axes', () => {
    const { last } = run(() => 'right');
    expect(last).toEqual({
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'C1' },
        { axis: 'VOCAB', level: 'C1' },
      ],
      assessedLevel: 'C1',
    });
  });

  it('all wrong (or don’t know) → A2 on both axes', () => {
    for (const v of ['wrong', 'dontKnow'] as const) {
      const { last } = run(() => v);
      expect(last).toEqual({
        kind: 'complete',
        axes: [
          { axis: 'GRAMMAR', level: 'A2' },
          { axis: 'VOCAB', level: 'A2' },
        ],
        assessedLevel: 'A2',
      });
    }
  });

  it('Р4: right/wrong alternating stays on B1, runs out of its 6 B1 questions, falls back to A2', () => {
    // Per axis: right, wrong, right, wrong, … — never two alike in a row.
    const { answers, steps, last } = run((p) => (Math.floor(p / 2) % 2 === 0 ? 'right' : 'wrong'));
    for (const step of steps) if (step.kind === 'question') expect(step.targetLevel).toBe('B1');
    const grammarLevels = answers.filter((a) => a.axis === 'GRAMMAR').map((a) => a.itemLevel);
    // Questions 7 and 8 of the axis: B1 is empty, A2 and B2 tie → the lower one.
    expect(grammarLevels).toEqual(['B1', 'B1', 'B1', 'B1', 'B1', 'B1', 'A2', 'A2']);
    // Last four = B1, B1, A2, A2 → mean rank 1.5 → rounded down → A2.
    expect(last).toMatchObject({ kind: 'complete', assessedLevel: 'A2' });
  });

  it('axes are independent; the overall level is their mean rounded down', () => {
    // GRAMMAR always right (C1), VOCAB always wrong (A2): mean rank 2.5 → B1.
    const { last } = run((p) => (p % 2 === 0 ? 'right' : 'wrong'));
    expect(last).toEqual({
      kind: 'complete',
      axes: [
        { axis: 'GRAMMAR', level: 'C1' },
        { axis: 'VOCAB', level: 'A2' },
      ],
      assessedLevel: 'B1',
    });
  });

  it('exhausted: an axis with no unanswered question at any level', () => {
    const grammarOnly = BANK.filter((p) => p.axis === 'GRAMMAR');
    const first = nextLadderStep({ attemptId: 'a', answers: [], pool: grammarOnly });
    expect(first.kind).toBe('question');
    if (first.kind !== 'question') return;
    const answers = [
      { ...answer(0, levelOf.get(first.itemId) as CefrLevelValue, true), itemId: first.itemId },
    ];
    expect(nextLadderStep({ attemptId: 'a', answers, pool: grammarOnly })).toEqual({
      kind: 'exhausted',
      axis: 'VOCAB',
    });
  });

  it('ignores pool items off the ladder (A1/C2) and of other axes', () => {
    const pool: LadderPoolItem[] = [
      { id: 'a1', axis: 'GRAMMAR', cefrLevel: 'A1' },
      { id: 'listen', axis: 'LISTENING', cefrLevel: 'B1' },
    ];
    expect(nextLadderStep({ attemptId: 'a', answers: [], pool })).toEqual({
      kind: 'exhausted',
      axis: 'GRAMMAR',
    });
  });
});

describe('fallback level', () => {
  const target = (pool: LadderPoolItem[]) => {
    const step = nextLadderStep({ attemptId: 'a', answers: [], pool }); // ladder at B1
    return step.kind === 'question' ? levelOf.get(step.itemId) : step.kind;
  };
  const only = (...levels: CefrLevelValue[]) =>
    BANK.filter((p) => p.axis === 'GRAMMAR' && levels.includes(p.cefrLevel));

  it('a tie between neighbours goes to the lower level', () => {
    expect(target(only('A2', 'B2'))).toBe('A2');
  });

  it('otherwise the nearest level wins', () => {
    expect(target(only('B2', 'C1'))).toBe('B2');
    expect(target(only('C1'))).toBe('C1');
  });
});

describe('ladderLevel', () => {
  const axis = (...oks: boolean[]) => oks.map((ok, i) => answer(i * 2, 'B1', ok));

  it('steps after two in a row and resets the streak', () => {
    expect(ladderLevel(axis(true, true))).toBe('B2');
    expect(ladderLevel(axis(true, true, true))).toBe('B2');
    expect(ladderLevel(axis(true, true, true, true))).toBe('C1');
    expect(ladderLevel(axis(false, false, false, false))).toBe('A2'); // clamped
    expect(ladderLevel(axis(true, true, false, false))).toBe('B1');
  });

  it('a broken streak does not count', () => {
    expect(ladderLevel(axis(true, false, true))).toBe('B1');
  });

  it('don’t know is wrong, even if flagged correct', () => {
    const dk = axis(true, true).map((a) => ({ ...a, dontKnow: true }));
    expect(ladderLevel(dk)).toBe('A2');
  });
});

describe('ladderAxisLevel', () => {
  const levels = (...ls: CefrLevelValue[]) => ls.map((l, i) => answer(i * 2, l, true));

  it('averages the question levels of the last four answers, rounding down', () => {
    expect(ladderAxisLevel(levels('B1', 'B1', 'B2', 'B2'))).toBe('B1'); // 2.5 → 2
    expect(ladderAxisLevel(levels('A2', 'A2', 'C1', 'C1', 'C1', 'C1'))).toBe('C1');
    expect(ladderAxisLevel(levels('B2', 'B2', 'B2', 'C1'))).toBe('B2'); // 3.25 → 3
  });

  it('is null without answers', () => {
    expect(ladderAxisLevel([])).toBeNull();
  });
});

describe('invalid input throws (a bug, never a learner action)', () => {
  const call = (answers: LadderAnswer[]) => () =>
    nextLadderStep({ attemptId: 'a', answers, pool: BANK });

  it('a gap in positions', () => {
    expect(call([answer(0, 'B1', true), answer(2, 'B1', true)])).toThrow(/expected position 1/);
  });

  it('an axis that does not match the position', () => {
    expect(call([{ ...answer(0, 'B1', true), axis: 'VOCAB' }])).toThrow(/must be GRAMMAR/);
  });

  it('the same item twice', () => {
    expect(call([answer(0, 'B1', true), { ...answer(1, 'B1', true), itemId: 'i0' }])).toThrow(
      /answered twice/,
    );
  });

  it('an answer past the last question', () => {
    const all = Array.from({ length: TOTAL_QUESTIONS + 1 }, (_, p) => answer(p, 'B1', true));
    expect(call(all)).toThrow(/past the last question/);
  });
});
