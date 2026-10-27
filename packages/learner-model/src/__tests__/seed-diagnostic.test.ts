import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_BANK } from '../../seed/diagnostic/bank';
import { bankProblems } from '../../seed/diagnostic/seed';
import { ITEM_PRACTICE } from '../../seed/items/practice';
import { type LadderAnswer, nextLadderStep, TOTAL_QUESTIONS } from '../diagnostic/ladder';

const CELLS = { A2: 6, B1: 8, B2: 6, C1: 6 } as const;

/** Lowercase, one space, any run of underscores as the gap. */
const normalize = (s: string) => s.toLowerCase().replace(/_+/g, '___').replace(/\s+/g, ' ').trim();

describe('diagnostic bank', () => {
  it('has 6/8/6/6 questions per level on each axis — 52 in all', () => {
    expect(DIAGNOSTIC_BANK).toHaveLength(52);
    for (const kind of ['GRAMMAR', 'VOCAB'] as const) {
      for (const [level, n] of Object.entries(CELLS)) {
        const cell = DIAGNOSTIC_BANK.filter((q) => q.kind === kind && q.cefrLevel === level);
        expect(cell, `${kind} ${level}`).toHaveLength(n);
      }
    }
  });

  it('validates (Zod, unique seed-diag-* ids) and keeps the three original ids', () => {
    expect(bankProblems(DIAGNOSTIC_BANK)).toEqual([]);
    const ids = DIAGNOSTIC_BANK.map((q) => q.id);
    for (const id of [
      'seed-diag-grammar-a2-01',
      'seed-diag-grammar-b1-01',
      'seed-diag-vocab-b2-01',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('every question: one gap, four distinct options, explanation present', () => {
    for (const q of DIAGNOSTIC_BANK) {
      const { stem, choices } = q.content.source;
      expect(stem.split('___').length, q.id).toBe(2);
      expect(choices, q.id).toHaveLength(4);
      expect(new Set(choices.map((c) => c.toLowerCase().trim())).size, q.id).toBe(4);
      expect(q.content.localized?.explanation?.en, q.id).toBeTruthy();
    }
  });

  it('every explanation in all four languages, each one really in its language', () => {
    const cyrillic = /[а-яё]/i;
    for (const q of DIAGNOSTIC_BANK) {
      const why = q.content.localized?.explanation;
      for (const locale of ['en', 'ru', 'uk', 'de'] as const) {
        expect(why?.[locale]?.trim(), `${q.id} ${locale}`).toBeTruthy();
      }
      // Not a copy of the English, nor of each other (ru ≠ uk).
      expect(why?.ru, q.id).toMatch(cyrillic);
      expect(why?.uk, q.id).toMatch(cyrillic);
      expect(why?.de, q.id).not.toMatch(cyrillic);
      expect(why?.de, q.id).not.toBe(why?.en);
      expect(why?.uk, q.id).not.toBe(why?.ru);
    }
  });

  it('the key moves around: no position holds over half a cell, and the bank is even', () => {
    const cells = new Map<string, number[]>();
    for (const q of DIAGNOSTIC_BANK) {
      const key = `${q.kind} ${q.cefrLevel}`;
      cells.set(key, [...(cells.get(key) ?? []), q.content.source.correctIndex]);
    }
    for (const [key, indices] of cells) {
      for (let i = 0; i < 4; i++) {
        expect(indices.filter((x) => x === i).length / indices.length, key).toBeLessThanOrEqual(
          0.5,
        );
      }
    }
    const overall = [0, 1, 2, 3].map(
      (i) => DIAGNOSTIC_BANK.filter((q) => q.content.source.correctIndex === i).length,
    );
    // 52 / 4 = 13 each; allow a little drift for future edits.
    for (const n of overall) expect(n).toBeGreaterThanOrEqual(11);
    for (const n of overall) expect(n).toBeLessThanOrEqual(15);
  });

  it('no stem twice, and none copied from the practice bank', () => {
    const stems = DIAGNOSTIC_BANK.map((q) => normalize(q.content.source.stem));
    expect(new Set(stems).size).toBe(stems.length);
    const practice = new Set(Object.values(ITEM_PRACTICE).map((p) => normalize(p.prompt)));
    expect(stems.filter((s) => practice.has(s))).toEqual([]);
  });
});

describe('diagnostic bank × ladder', () => {
  const pool = DIAGNOSTIC_BANK.map((q) => ({ id: q.id, axis: q.kind, cefrLevel: q.cefrLevel }));
  const levelOf = new Map(DIAGNOSTIC_BANK.map((q) => [q.id, q.cefrLevel]));

  const run = (right: (position: number) => boolean) => {
    const answers: LadderAnswer[] = [];
    for (;;) {
      const step = nextLadderStep({ attemptId: 'bank', answers, pool });
      if (step.kind !== 'question') return step;
      answers.push({
        position: step.position,
        axis: step.axis,
        itemId: step.itemId,
        itemLevel: levelOf.get(step.itemId) ?? 'B1',
        correct: right(step.position),
        dontKnow: false,
      });
    }
  };

  it('never runs dry, whatever the learner answers', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: TOTAL_QUESTIONS, maxLength: TOTAL_QUESTIONS }),
        (vs) => {
          expect(run((p) => vs[p] ?? false).kind).toBe('complete');
        },
      ),
    );
  });

  it('alternating right/wrong stays on B1 and, with 8 B1 questions, ends on B1', () => {
    expect(run((p) => Math.floor(p / 2) % 2 === 0)).toMatchObject({
      kind: 'complete',
      assessedLevel: 'B1',
    });
  });
});
