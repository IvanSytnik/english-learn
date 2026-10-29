import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../policy/rng';
import { buildVocabCard, cardSeed, VocabCardError, type VocabCardInput } from '../card';
import { pickDistractors } from '../distractors';
import { gradeVocabAnswer } from '../grade';
import { glossOf } from '../text';
import { VOCAB_MODES, type VocabLexeme } from '../types';
import { example, lex } from './fixtures';

const APPLE = lex('apple', {
  ru: 'яблоко',
  uk: 'яблуко',
  de: 'der Apfel',
  en: 'a round fruit',
  examples: [example('I ate an apple today.', 'apple')],
});
const FOOD = [
  APPLE,
  lex('pear'),
  lex('bread'),
  lex('cheese'),
  lex('orange'),
  lex('milk'),
  lex('egg'),
];
const card = (over: Partial<VocabCardInput> & { target: VocabLexeme }) =>
  buildVocabCard({ pool: FOOD, mode: 'l1_to_en', locale: 'ru', seed: 's1', ...over });

describe('buildVocabCard — choice modes', () => {
  it.each([
    'en_to_l1',
    'l1_to_en',
    'cloze',
  ] as const)('%s: four distinct options, the key points at the answer', (mode) => {
    const { view, key } = card({ target: APPLE, mode });
    if (!('options' in view) || key.kind !== 'choice') throw new Error('not a choice card');
    expect(view.options).toHaveLength(4);
    expect(new Set(view.options).size).toBe(4);
    const answer = { en_to_l1: 'яблоко', l1_to_en: 'apple', cloze: 'an apple' }[mode];
    expect(view.options[key.correctIndex]).toBe(answer);
  });

  it('mode 1 shows the word, mode 2 the gloss', () => {
    expect(card({ target: APPLE, mode: 'en_to_l1' }).view).toMatchObject({
      word: 'apple',
      ipa: null,
    });
    expect(card({ target: APPLE, mode: 'l1_to_en' }).view).toMatchObject({ gloss: 'яблоко' });
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(card({ target: APPLE, seed: 'x' })).toEqual(card({ target: APPLE, seed: 'x' }));
    const variants = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(card({ target: APPLE, seed: `s${i}` }))),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('uses the English definition for a learner without a gloss language', () => {
    const { view } = card({ target: APPLE, mode: 'en_to_l1', locale: 'en' });
    expect(view).toMatchObject({ options: expect.arrayContaining(['a round fruit']) });
    expect(card({ target: APPLE, locale: 'en' }).view).toMatchObject({ gloss: 'a round fruit' });
  });

  it('throws when fewer than three distractors exist', () => {
    expect(() => card({ target: APPLE, pool: FOOD.slice(0, 3) })).toThrow(VocabCardError);
  });

  it('seeds a question until the word is answered', () => {
    expect(cardSeed({ userId: 'u', itemId: 'i', lastReviewAt: null })).toBe('u:i:new');
    expect(cardSeed({ userId: 'u', itemId: 'i', lastReviewAt: 5n })).toBe('u:i:5');
  });
});

describe('distractors', () => {
  const pick = (target: VocabLexeme, pool: VocabLexeme[], seed = 1) =>
    pickDistractors({
      target,
      pool,
      locale: 'ru',
      rng: makeRng(seed),
      optionOf: (l) => l.lemma,
      targetOption: target.lemma,
    }).map((d) => d.lexeme.lemma);

  it('prefers the same topic and POS, then falls back tier by tier', () => {
    // places.a1 has three words: one more noun there, the rest from wider tiers.
    const place = (w: string, o = {}) => lex(w, { concept: 'vocab.places.a1', ...o });
    const target = place('city');
    const pool = [
      target,
      place('village'),
      place('quiet', { pos: 'ADJECTIVE' }),
      lex('table', { concept: 'vocab.home.a1' }),
      lex('road', { concept: 'vocab.travel.a2', level: 'A2' }),
      lex('river', { concept: 'vocab.nature.b1', level: 'B1' }),
      lex('run', { pos: 'VERB', concept: 'vocab.sport.a1' }),
    ];
    for (let seed = 0; seed < 30; seed++) {
      expect(pick(target, pool, seed)).toEqual(['village', 'table', 'road']);
    }
    // Without a same-POS adjacent level, the same level with any POS fills in.
    const noA2 = pool.filter((l) => l.lemma !== 'road');
    const filled = pick(target, noA2);
    expect(filled.slice(0, 2)).toEqual(['village', 'table']);
    expect(['quiet', 'run']).toContain(filled[2]);
  });

  it('never two levels away', () => {
    const target = lex('city');
    const pool = [target, lex('a'), lex('b'), lex('far', { level: 'B1' })];
    expect(pick(target, pool)).not.toContain('far');
  });

  it('excludes the same lemmaKey and the same gloss in the learner language', () => {
    const above = lex('above', { pos: 'PREPOSITION', ru: 'над', de: 'oben' });
    const pool = [
      above,
      lex('over', { pos: 'PREPOSITION', ru: 'над', de: 'über' }),
      // Same lemmaKey, its own gloss: only the lemmaKey rule keeps it out.
      lex('Above', { id: 'lx.Above2', pos: 'PREPOSITION', ru: 'выше', de: 'höher' }),
      lex('under', { pos: 'PREPOSITION' }),
      lex('near', { pos: 'PREPOSITION' }),
      lex('behind', { pos: 'PREPOSITION' }),
    ];
    // Options as lemmas (mode 2) — a same-gloss word would be a second right answer.
    const asLemmas = (locale: 'ru' | 'de', seed: number) =>
      pickDistractors({
        target: above,
        pool,
        locale,
        rng: makeRng(seed),
        optionOf: (l) => l.lemma,
        targetOption: above.lemma,
        count: 4,
      }).map((d) => d.lexeme.id);
    // Options as glosses (mode 1) — `Above` has its own gloss, so only the lemmaKey rule bars it.
    const asGlosses = (seed: number) =>
      pickDistractors({
        target: above,
        pool,
        locale: 'ru',
        rng: makeRng(seed),
        optionOf: (l) => glossOf(l, 'ru'),
        targetOption: glossOf(above, 'ru'),
        count: 4,
      }).map((d) => d.lexeme.id);
    for (let seed = 0; seed < 40; seed++) {
      expect(asLemmas('ru', seed)).not.toContain('lx.over');
      expect(asGlosses(seed)).not.toContain('lx.Above2');
      // In German the glosses differ, so `over` is a fair distractor there.
      expect(asLemmas('de', seed)).toContain('lx.over');
    }
  });
});

describe('cloze', () => {
  const verb = (w: string, sentence: string, target: string) =>
    lex(w, { pos: 'VERB', examples: [example(sentence, target)] });
  const VERBS = [
    verb('blow', 'The wind blew hard.', 'blew'),
    verb('walk', 'We walked home.', 'walked'),
    verb('eat', 'She ate it.', 'ate'),
    verb('sing', 'They sing well.', 'sing'),
    verb('read', 'He reads a lot.', 'reads'),
    verb('carry', 'I carried it.', 'carried'),
    verb('jump', 'Jump now!', 'Jump'),
  ];
  const cloze = (target: VocabLexeme, pool = VERBS, seed = 's') =>
    buildVocabCard({ target, pool, mode: 'cloze', locale: 'ru', seed });

  it('offers the surface form of the blank, never a bare lemma against it', () => {
    const blow = VERBS[0] as VocabLexeme;
    for (let i = 0; i < 20; i++) {
      const { view, key } = cloze(blow, VERBS, `s${i}`);
      if (view.mode !== 'cloze' || key.kind !== 'choice') throw new Error('not cloze');
      expect(view.sentence).toBe('The wind ___ hard.');
      expect(view.options[key.correctIndex]).toBe('blew');
      expect(new Set(view.options)).toEqual(new Set(['blew', 'walked', 'ate', 'carried']));
    }
  });

  it('matches a sentence-initial capital', () => {
    const jump = VERBS[6] as VocabLexeme;
    const { view } = cloze(jump);
    if (view.mode !== 'cloze') throw new Error('not cloze');
    expect(view.sentence).toBe('___ now!');
    for (const option of view.options) expect(option).toMatch(/^[A-Z]/);
  });

  it('takes the article into the blank, each option with its own', () => {
    const { view, key } = card({ target: APPLE, mode: 'cloze' });
    if (view.mode !== 'cloze' || key.kind !== 'choice') throw new Error('not cloze');
    expect(view.sentence).toBe('I ate ___ today.');
    expect(view.options[key.correctIndex]).toBe('an apple');
    for (const option of view.options) expect(option).toMatch(/^(a [^aeiou]|an [aeiou])/);
    expect(view.options).toContain('an egg');
  });

  it('throws for a word without an example sentence', () => {
    expect(() => cloze({ ...APPLE, examples: [] }, FOOD)).toThrow(VocabCardError);
  });
});

describe('recall modes and grading', () => {
  const COLOR = lex('color', { variants: ['colour'], ru: 'цвет' });
  const POOL = [COLOR, lex('shade', { ru: 'цвет' }), lex('look up', { pos: 'PHRASAL_VERB' })];

  it('mode 4 shows the gloss and a first-letter cue, mode 5 the gloss only', () => {
    expect(
      buildVocabCard({ target: COLOR, pool: POOL, mode: 'cued_recall', locale: 'ru', seed: 's' })
        .view,
    ).toEqual({
      mode: 'cued_recall',
      gloss: 'цвет',
      cue: 'c____',
    });
    expect(
      buildVocabCard({ target: COLOR, pool: POOL, mode: 'full_recall', locale: 'ru', seed: 's' })
        .view,
    ).toEqual({
      mode: 'full_recall',
      gloss: 'цвет',
    });
  });

  it('grades typed answers: case, spaces, variants; a same-gloss word is a soft collision', () => {
    const { key } = buildVocabCard({
      target: COLOR,
      pool: POOL,
      mode: 'full_recall',
      locale: 'ru',
      seed: 's',
    });
    const typed = (text: string) => gradeVocabAnswer(key, { kind: 'text', text });
    expect(typed('color')).toBe('CORRECT');
    expect(typed('  COLOUR ')).toBe('CORRECT');
    expect(typed('shade')).toBe('SYNONYM_COLLISION');
    expect(typed('colr')).toBe('INCORRECT');
    expect(typed('   ')).toBe('INVALID');
    expect(gradeVocabAnswer(key, { kind: 'choice', index: 0 })).toBe('INVALID');
    expect(gradeVocabAnswer(key, { kind: 'dont_know' })).toBe('DONT_KNOW');
  });

  it('no collision in a language where the glosses differ', () => {
    const { key } = buildVocabCard({
      target: COLOR,
      pool: POOL,
      mode: 'full_recall',
      locale: 'de',
      seed: 's',
    });
    expect(gradeVocabAnswer(key, { kind: 'text', text: 'shade' })).toBe('INCORRECT');
  });

  it('grades choices by index; anything out of range is INVALID', () => {
    const { key } = card({ target: APPLE });
    if (key.kind !== 'choice') throw new Error('not a choice card');
    expect(gradeVocabAnswer(key, { kind: 'choice', index: key.correctIndex })).toBe('CORRECT');
    expect(gradeVocabAnswer(key, { kind: 'choice', index: (key.correctIndex + 1) % 4 })).toBe(
      'INCORRECT',
    );
    for (const index of [-1, 4, 1.5, Number.NaN]) {
      expect(gradeVocabAnswer(key, { kind: 'choice', index })).toBe('INVALID');
    }
    expect(gradeVocabAnswer(key, { kind: 'text', text: 'apple' })).toBe('INVALID');
  });
});

describe('the client view never carries the answer (Axiom 3)', () => {
  it('no key, no ids, and no answer text in recall or cloze prompts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VOCAB_MODES),
        fc.constantFrom('ru', 'uk', 'de', 'en' as const),
        fc.string(),
        (mode, locale, seed) => {
          const { view } = buildVocabCard({ target: APPLE, pool: FOOD, mode, locale, seed });
          const json = JSON.stringify(view);
          expect(json).not.toMatch(/correctIndex|accepted|synonyms|lx\./);
          if (mode === 'cued_recall' || mode === 'full_recall') {
            expect(json).not.toContain('apple');
            expect(json).toContain(glossOf(APPLE, locale).slice(0, 5));
          }
          if (mode === 'cloze' && view.mode === 'cloze') {
            expect(view.sentence).not.toContain('apple');
          }
        },
      ),
    );
  });
});

describe('fallbacks that keep the answer out of the prompt', () => {
  it('a cognate gloss gives way to the English definition (modes 2, 4, 5)', () => {
    const bank = lex('bank', { de: 'die Bank', en: 'a place that keeps money' });
    const pool = [bank, ...FOOD];
    for (const mode of ['l1_to_en', 'cued_recall', 'full_recall'] as const) {
      const { view } = buildVocabCard({ target: bank, pool, mode, locale: 'de', seed: 's' });
      expect(view).toMatchObject({ gloss: 'a place that keeps money' });
    }
    // A gloss that only shares letters is kept (`Bankett` is not `bank`).
    const kept = lex('bank', { de: 'das Bankett', en: 'x' });
    const { view } = buildVocabCard({
      target: kept,
      pool: [kept, ...FOOD],
      mode: 'full_recall',
      locale: 'de',
      seed: 's',
    });
    expect(view).toMatchObject({ gloss: 'das Bankett' });
  });

  it('a cloze without three same-form distractors is served as mode 2', () => {
    const hearted = lex('hearted', {
      pos: 'ADJECTIVE',
      examples: [example('My kind-hearted friend helps.', 'kind-hearted')],
    });
    const { view, key } = buildVocabCard({
      target: hearted,
      pool: [hearted, ...FOOD],
      mode: 'cloze',
      locale: 'ru',
      seed: 's',
    });
    expect(view.mode).toBe('l1_to_en');
    expect(key).toMatchObject({ kind: 'choice', mode: 'l1_to_en' });
  });
});
