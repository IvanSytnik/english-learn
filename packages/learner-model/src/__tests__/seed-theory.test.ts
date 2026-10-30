import { normalizeClozeAnswer, PRACTICE_GAP } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { SEED_CONCEPTS } from '../../seed';
import { DIAGNOSTIC_BANK } from '../../seed/diagnostic/bank';
import { ALL_ITEMS, ITEM_PRACTICE } from '../../seed/items';
import { GRAMMAR_THEORY, getConceptTheory } from '../theory';

const grammarIds = SEED_CONCEPTS.filter((c) => c.category === 'GRAMMAR').map((c) => c.id);
const entries = Object.entries(GRAMMAR_THEORY);
const examples = entries.flatMap(([id, t]) => t.examples.map((e) => ({ id, ...e })));

const cyrillic = /[а-яёіїєґ]/i;
const words = (s: string) =>
  normalizeClozeAnswer(s)
    .replace(/[.,!?;:—–"]/g, ' ')
    .split(/\s+/);

/** A sentence with a `___` gap as a regex that matches it filled with anything. */
function gapPattern(prompt: string): RegExp {
  const [before = '', after = ''] = normalizeClozeAnswer(prompt)
    .split(normalizeClozeAnswer(PRACTICE_GAP))
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${before}.+${after}$`);
}

/** Every 6-word run of `s`, gap-free. */
function runs(s: string, n = 6): string[] {
  const out: string[] = [];
  for (const chunk of s.split(PRACTICE_GAP)) {
    const w = words(chunk).filter(Boolean);
    for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  }
  return out;
}

/** What a learner already meets elsewhere: practice prompts and diagnostic stems. */
const questions = [
  ...Object.entries(ITEM_PRACTICE).map(([id, p]) => ({ id, text: p.prompt })),
  ...DIAGNOSTIC_BANK.map((q) => ({ id: q.id, text: q.content.source.stem })),
];
/** Item example sentences (the `source` of every grammar item). */
const itemSentences = ALL_ITEMS.flatMap((i) => {
  const s = i.content.source as { example?: string; contrastExample?: string };
  return [s.example, s.contrastExample].filter((x): x is string => typeof x === 'string');
});

describe('grammar theory catalog (B3.2)', () => {
  it('covers every seed GRAMMAR concept — 9 A2, 5 B1, 2 B2 — and nothing else', () => {
    expect(grammarIds).toHaveLength(16);
    for (const id of grammarIds) expect(GRAMMAR_THEORY[id], id).toBeDefined();
    expect(Object.keys(GRAMMAR_THEORY).sort()).toEqual([...grammarIds].sort());
  });

  it('every entry has a formula, a summary and 2–3 examples', () => {
    for (const [id, t] of entries) {
      expect(t.formula.trim(), id).toBeTruthy();
      expect(t.formula, id).not.toMatch(cyrillic);
      expect(t.examples.length, id).toBeGreaterThanOrEqual(2);
      expect(t.examples.length, id).toBeLessThanOrEqual(3);
      // Short: a reference card, not a lesson.
      expect(t.summary.en.length, id).toBeLessThanOrEqual(420);
    }
  });

  it('every text is in all four languages, each one really in its language', () => {
    const texts = [
      ...entries.map(([id, t]) => ({ where: `${id} summary`, ...t.summary })),
      ...examples.map((e) => ({ where: `${e.id} "${e.en}"`, en: e.en, ...e.translation })),
    ];
    for (const { where, en, ru, uk, de } of texts) {
      for (const text of [en, ru, uk, de]) expect(text.trim(), where).toBeTruthy();
      expect(en, where).not.toMatch(cyrillic);
      expect(ru, where).toMatch(cyrillic);
      expect(uk, where).toMatch(cyrillic);
      expect(de, where).not.toMatch(cyrillic);
      expect(de, where).not.toBe(en);
      expect(uk, where).not.toBe(ru);
      // ы, э, ъ, ё do not exist in Ukrainian.
      expect(uk, where).not.toMatch(/[ыэъё]/i);
    }
  });

  it('follows the typography of DECISIONS 2026-10-27', () => {
    const native = [
      ...entries.map(([id, t]) => ({ where: `${id} summary`, ...t.summary })),
      ...examples.map((e) => ({ where: `${e.id} "${e.en}"`, ...e.translation })),
    ];
    for (const { where, ru, uk, de } of native) {
      // ’ in Ukrainian words, never the ASCII apostrophe.
      expect(uk, where).not.toMatch(/[а-яіїєґ]'[а-яіїєґ]/i);
      // «…» in ru/uk, „…“ in de; never straight double quotes.
      expect(`${ru} ${uk}`, where).not.toMatch(/[„“"]/);
      expect(de, where).not.toMatch(/[«»"]/);
    }
  });

  it('addresses the learner as вы/ви in ru/uk and du in de, never the other way', () => {
    for (const [id, t] of entries) {
      expect(t.summary.ru, id).not.toMatch(/(?<![а-яё])(ты|тебе|тебя|твой|твоя|твои)(?![а-яё])/i);
      expect(t.summary.uk, id).not.toMatch(
        /(?<![а-яіїєґ])(ти|тобі|тебе|твій|твоя|твої)(?![а-яіїєґ’])/i,
      );
      expect(t.summary.de, id).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
    }
  });

  it('every focus is a real substring of its example', () => {
    for (const e of examples) {
      expect(e.focus.length, e.en).toBeGreaterThan(0);
      for (const f of e.focus) expect(e.en, f).toContain(f);
    }
  });

  it('no example repeats a practice prompt, a diagnostic stem or an item example', () => {
    expect(questions).toHaveLength(176 + 52);
    const seen = new Set(itemSentences.map(normalizeClozeAnswer));
    const patterns = questions.map((q) => ({ id: q.id, re: gapPattern(q.text) }));
    for (const e of examples) {
      const sentence = normalizeClozeAnswer(e.en);
      expect(seen.has(sentence), `${e.id}: "${e.en}" is an item example`).toBe(false);
      for (const { id, re } of patterns) {
        expect(re.test(sentence), `${e.id}: "${e.en}" fills ${id}`).toBe(false);
      }
    }
  });

  it('no example shares a 6-word run with any question (no near-copies)', () => {
    const questionRuns = new Map<string, string>();
    for (const q of questions) for (const r of runs(q.text)) questionRuns.set(r, q.id);
    for (const e of examples) {
      for (const r of runs(e.en)) {
        expect(questionRuns.get(r), `${e.id}: "${r}"`).toBeUndefined();
      }
    }
  });

  it('no example appears twice in the catalog', () => {
    const normalized = examples.map((e) => normalizeClozeAnswer(e.en));
    expect(new Set(normalized).size).toBe(normalized.length);
  });
});

describe('getConceptTheory', () => {
  it('resolves one language: the summary and translations in it, English sentences as is', () => {
    const view = getConceptTheory('grammar.conditional_2', 'uk');
    const source = GRAMMAR_THEORY['grammar.conditional_2'];
    expect(view).toEqual({
      formula: source?.formula,
      summary: source?.summary.uk,
      locale: 'uk',
      examples: source?.examples.map((e) => ({
        en: e.en,
        focus: [...e.focus],
        translation: e.translation.uk,
      })),
    });
  });

  it('English: no translation line (it would repeat the sentence)', () => {
    const view = getConceptTheory('grammar.past_simple', 'en');
    expect(view?.summary).toBe(GRAMMAR_THEORY['grammar.past_simple']?.summary.en);
    expect(view?.examples.every((e) => e.translation === null)).toBe(true);
  });

  it('null for a concept without theory (vocabulary, unknown id)', () => {
    const vocab = SEED_CONCEPTS.find((c) => c.category !== 'GRAMMAR');
    expect(vocab).toBeDefined();
    expect(getConceptTheory(vocab?.id ?? '', 'ru')).toBeNull();
    expect(getConceptTheory('grammar.nope', 'ru')).toBeNull();
  });
});
