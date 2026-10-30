import { hasPracticeQuestion } from '@englishlearn/db/queries/practisable';
import {
  normalizeClozeAnswer,
  PRACTICE_GAP,
  type Practice,
  safeParseItemContent,
} from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { SEED_CONCEPTS } from '../../seed';
import { ALL_ITEMS, ITEM_PRACTICE } from '../../seed/items';

type Localized = Partial<Record<'en' | 'ru' | 'uk' | 'de', string>>;

const practiceOf = (content: unknown) => (content as { practice?: Practice }).practice;
const localizedOf = (content: unknown) =>
  (content as { localized?: Record<string, Localized | undefined> }).localized ?? {};

/** Correct-option position counts per concept (choice questions only). */
function positionsByConcept(): Map<string, number[]> {
  const by = new Map<string, number[]>();
  for (const item of ALL_ITEMS) {
    const p = practiceOf(item.content);
    if (p?.type !== 'choice') continue;
    by.set(item.conceptId, [...(by.get(item.conceptId) ?? []), p.correctIndex]);
  }
  return by;
}

describe('seed item practice (U2)', () => {
  it('every seed item validates with its kind schema', () => {
    expect(ALL_ITEMS).toHaveLength(176);
    for (const item of ALL_ITEMS) {
      expect(safeParseItemContent(item.kind, item.content).success, item.id).toBe(true);
    }
  });

  it('every A2–B1 grammar concept has at least 10 practisable items (B3.1)', () => {
    const targets = SEED_CONCEPTS.filter(
      (c) => c.category === 'GRAMMAR' && (c.cefrLevel === 'A2' || c.cefrLevel === 'B1'),
    );
    expect(targets).toHaveLength(14);
    for (const concept of targets) {
      const n = ALL_ITEMS.filter(
        (i) => i.conceptId === concept.id && hasPracticeQuestion(i.content),
      ).length;
      expect(n, concept.id).toBeGreaterThanOrEqual(10);
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

  it('every cloze prompt ends with a "(base form)" cue', () => {
    for (const [id, p] of Object.entries(ITEM_PRACTICE)) {
      if (p.type === 'cloze') expect(p.prompt, id).toMatch(/\([^()]+\)$/);
    }
  });

  it('no prompt appears twice in the bank', () => {
    const seen = new Map<string, string>();
    for (const [id, p] of Object.entries(ITEM_PRACTICE)) {
      const key = normalizeClozeAnswer(p.prompt);
      expect(seen.get(key), `${id} repeats a prompt`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it('no option (or accepted answer) appears twice in one question', () => {
    for (const [id, p] of Object.entries(ITEM_PRACTICE)) {
      const values = p.type === 'choice' ? p.options : p.acceptedAnswers;
      const normalized = values.map(normalizeClozeAnswer);
      expect(new Set(normalized).size, id).toBe(values.length);
    }
  });

  it('every learner-facing text in all four languages, each one really in its language', () => {
    const cyrillic = /[а-яёіїєґ]/i;
    for (const item of ALL_ITEMS) {
      for (const [field, text] of Object.entries(localizedOf(item.content))) {
        const where = `${item.id} ${field}`;
        for (const locale of ['en', 'ru', 'uk', 'de'] as const) {
          expect(text?.[locale]?.trim(), `${where}.${locale}`).toBeTruthy();
        }
        // Not a copy of the English, nor of each other (ru ≠ uk).
        expect(text?.ru, where).toMatch(cyrillic);
        expect(text?.uk, where).toMatch(cyrillic);
        expect(text?.de, where).not.toMatch(cyrillic);
        expect(text?.de, where).not.toBe(text?.en);
        expect(text?.uk, where).not.toBe(text?.ru);
        // Typography (DECISIONS 2026-10-27): ’ in Ukrainian words, «…» vs „…“.
        expect(text?.uk, where).not.toMatch(/[а-яіїєґ]'[а-яіїєґ]/i);
        expect(text?.de, where).not.toMatch(/[«»]/);
        expect(`${text?.ru} ${text?.uk}`, where).not.toMatch(/[„“]/);
      }
    }
  });

  it('the H hint never contains the answer, in any language (S3)', () => {
    // hintFor() shows `translation` (vocab word, collocation) or `meaning`
    // (idiom) before the learner answers; the headword in it gives the answer away.
    const word = (answer: string) =>
      new RegExp(`(?<!\\p{L})${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu');
    for (const item of ALL_ITEMS) {
      const practice = practiceOf(item.content);
      if (!practice) continue;
      const localized = localizedOf(item.content);
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

  it('spreads the correct choice within every concept too', () => {
    // A global spread can hide a per-topic tell ("in this topic it's always B").
    for (const [conceptId, positions] of positionsByConcept()) {
      const counts = new Map<number, number>();
      for (const i of positions) counts.set(i, (counts.get(i) ?? 0) + 1);
      for (const n of counts.values()) {
        expect(n / positions.length, conceptId).toBeLessThanOrEqual(0.4);
      }
    }
  });
});
