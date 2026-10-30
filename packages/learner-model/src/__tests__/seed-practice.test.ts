import { hasPracticeQuestion } from '@englishlearn/db/queries/practisable';
import { PRACTICE_GAP, type Practice, safeParseItemContent } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, ITEM_PRACTICE } from '../../seed/items';

describe('seed item practice (U2)', () => {
  it('every seed item validates with its kind schema', () => {
    expect(ALL_ITEMS).toHaveLength(92);
    for (const item of ALL_ITEMS) {
      expect(safeParseItemContent(item.kind, item.content).success, item.id).toBe(true);
    }
  });

  it('every grammar item is practisable (hasPractice, as seed:items writes it)', () => {
    const grammar = ALL_ITEMS.filter((i) => i.kind === 'GRAMMAR_PATTERN');
    expect(grammar.length).toBeGreaterThan(0);
    for (const item of grammar) expect(hasPracticeQuestion(item.content), item.id).toBe(true);
  });

  it('a vocab item may ship without a question: it seeds with hasPractice = false', () => {
    // VOCAB_WORD / COLLOCATION / IDIOM can be added before their practice;
    // such an item is valid content but stays out of the selection pool.
    const vocab = ALL_ITEMS.find((i) => i.kind !== 'GRAMMAR_PATTERN');
    if (!vocab) throw new Error('no vocab seed item');
    const { practice: _, ...content } = vocab.content as { practice?: unknown };
    expect(safeParseItemContent(vocab.kind, content).success).toBe(true);
    expect(hasPracticeQuestion(content)).toBe(false);
  });

  it('every practice question validates with its item kind schema', () => {
    for (const item of ALL_ITEMS.filter((i) => hasPracticeQuestion(i.content))) {
      const parsed = safeParseItemContent(item.kind, item.content);
      expect(parsed.success && parsed.data.practice, item.id).toBeTruthy();
    }
  });

  it('has no practice for unknown items', () => {
    const ids = new Set(ALL_ITEMS.map((i) => i.id));
    expect(Object.keys(ITEM_PRACTICE).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every prompt shows exactly one gap', () => {
    for (const [id, p] of Object.entries(ITEM_PRACTICE)) {
      expect(p.prompt.split(PRACTICE_GAP).length, id).toBe(2);
    }
  });

  it('the H hint never contains the answer, in any language (S3)', () => {
    // hintFor() shows `translation` (vocab word, collocation) or `meaning`
    // (idiom) before the learner answers; the headword in it gives the answer away.
    const word = (answer: string) =>
      new RegExp(`(?<!\\p{L})${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu');
    for (const item of ALL_ITEMS) {
      const { localized = {}, practice } = item.content as {
        localized?: Record<string, Record<string, string> | undefined>;
        practice?: Practice;
      };
      if (!practice) continue;
      const answers = (
        practice.type === 'choice'
          ? [practice.options[practice.correctIndex]]
          : practice.acceptedAnswers
      ).filter((a): a is string => a !== undefined && a !== '—');
      for (const field of ['translation', 'meaning']) {
        for (const [locale, text] of Object.entries(localized[field] ?? {})) {
          for (const answer of answers) {
            expect(text, `${item.id} ${field}.${locale}`).not.toMatch(word(answer));
          }
        }
      }
    }
  });

  it('spreads the correct choice across positions (no positional tell)', () => {
    const counts = new Map<number, number>();
    for (const p of Object.values(ITEM_PRACTICE)) {
      if (p.type === 'choice') counts.set(p.correctIndex, (counts.get(p.correctIndex) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const n of counts.values()) expect(n / total).toBeLessThan(0.4);
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });
});
