import { describe, expect, it } from 'vitest';
import type { LexemeGenOutcome } from '../../../src/lexeme-gen';
import type { WireLexemeEntry } from '../../../src/lexeme-gen/types';
import { batchCases, type GoldenCase, loadGoldenSet, scoreCase, tallyByCategory } from '../harness';

const entry = (lemma: string, pos: WireLexemeEntry['pos']) => ({ lemma, pos }) as WireLexemeEntry;
const entries = (...e: WireLexemeEntry[]): LexemeGenOutcome => ({
  key: '1',
  input: 'x',
  kind: 'entries',
  entries: e,
});
const rejected = (
  reason: 'misspelling' | 'not_a_word',
  suggestion: string | null = null,
): LexemeGenOutcome => ({
  key: '1',
  input: 'x',
  kind: 'rejected',
  reason,
  suggestion,
});
const invalid: LexemeGenOutcome = { key: '1', input: 'x', kind: 'invalid', problems: ['bad'] };

const wordCase: GoldenCase = {
  input: 'wolves',
  category: 'inflected',
  expect: { word: true, lemma: ['wolf'], pos: ['NOUN'] },
};
const typoCase: GoldenCase = {
  input: 'seperate',
  category: 'misspelling',
  expect: { word: false, reasons: ['misspelling'], suggestion: 'separate' },
};

describe('lexeme-gen eval harness', () => {
  it('the committed golden set parses and covers every category the spec names', () => {
    const golden = loadGoldenSet();
    const categories = new Set(golden.cases.map((c) => c.category));
    for (const c of [
      'homonym',
      'phrasal_verb',
      'informal',
      'misspelling',
      'non_word',
      'proper_noun',
      'offensive',
      'not_english',
    ]) {
      expect(categories).toContain(c);
    }
  });

  it('a word passes when any entry has an expected lemma and pos', () => {
    expect(scoreCase(wordCase, entries(entry('wolf', 'NOUN')))).toEqual({
      pass: true,
      failures: [],
    });
    expect(scoreCase(wordCase, entries(entry('wolves', 'NOUN'))).pass).toBe(false);
    expect(scoreCase(wordCase, entries(entry('wolf', 'VERB'))).pass).toBe(false);
    expect(scoreCase(wordCase, rejected('not_a_word')).pass).toBe(false);
    expect(scoreCase(wordCase, invalid).pass).toBe(false);
  });

  it('a rejection passes with an expected reason and suggestion', () => {
    expect(scoreCase(typoCase, rejected('misspelling', 'Separate')).pass).toBe(true);
    expect(scoreCase(typoCase, rejected('misspelling', 'seperated')).pass).toBe(false);
    expect(scoreCase(typoCase, rejected('not_a_word')).pass).toBe(false);
    expect(scoreCase(typoCase, entries(entry('separate', 'VERB'))).pass).toBe(false);
    expect(scoreCase(typoCase, invalid).pass).toBe(false);
  });

  it('batches are stable, at most `size`, keyed 1..n, and mix categories', () => {
    const { cases } = loadGoldenSet();
    const a = batchCases(cases, 10);
    expect(batchCases([...cases].reverse(), 10)).toEqual(a);
    expect(a.flatMap((b) => b.cases)).toHaveLength(cases.length);
    for (const b of a) {
      expect(b.items.length).toBeLessThanOrEqual(10);
      expect(b.items.map((i) => i.key)).toEqual(b.items.map((_, i) => String(i + 1)));
      expect(b.items.map((i) => i.input)).toEqual(b.cases.map((c) => c.input));
    }
    expect(Math.max(...a.map((b) => new Set(b.cases.map((c) => c.category)).size))).toBeGreaterThan(
      3,
    );
  });

  it('tallies by category', () => {
    expect(
      tallyByCategory([
        { category: 'b', pass: true },
        { category: 'a', pass: false },
        { category: 'b', pass: false },
      ]),
    ).toEqual({ a: { passed: 0, total: 1 }, b: { passed: 1, total: 2 } });
  });
});
