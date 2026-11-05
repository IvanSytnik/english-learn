import { describe, expect, it } from 'vitest';
import { seedFromString } from '../../policy/rng';
import { buildVocabCard } from '../card';
import { gradeVocabAnswer } from '../grade';
import { containsWholeWord, surfaceForms } from '../text';
import type { VocabLexeme } from '../types';
import { definitionToEn } from '../variants/definition-to-en';
import { example, lex } from './fixtures';

/** B6.5 `definition_to_en` (mode 2, B1+): leak guards, the pool filter, the seeded pick. */

const SHOP = 'vocab.shopping.b1';
const verb = (lemma: string, opts: Parameters<typeof lex>[1] = {}) =>
  lex(lemma, { pos: 'VERB', level: 'B1', concept: 'vocab.work.b1', ...opts });

const purchase = verb('purchase', { concept: SHOP, en: 'to buy goods with money' });
// Named by the definition, and the closest distractors (same topic, same POS).
const NAMED = [
  verb('buy', { concept: SHOP }),
  verb('goods', { concept: SHOP }),
  verb('money', { concept: SHOP }),
];
const CLEAN = [verb('sell'), verb('pay'), verb('order')];
const POOL = [purchase, ...NAMED, ...CLEAN];

const ctx = (pool: readonly VocabLexeme[], learnerLevel: 'A2' | 'B1' | 'B2' | null = 'B1') => ({
  pool,
  locale: 'ru' as const,
  seed: 's',
  learnerLevel,
});
const rung2 = (target: VocabLexeme, pool: readonly VocabLexeme[], seed: string, level = 'B1') =>
  buildVocabCard({
    target,
    pool,
    mode: 'l1_to_en',
    locale: 'ru',
    seed,
    learnerLevel: level as 'B1',
  });
const SEEDS = Array.from({ length: 40 }, (_, i) => `u:i:${i}`);

describe('definition_to_en eligibility', () => {
  it('a clean definition, ≥ 3 fair distractors, a B1+ learner: eligible', () => {
    expect(definitionToEn.eligible(purchase, ctx(POOL, 'B1'))).toBe(true);
    expect(definitionToEn.eligible(purchase, ctx(POOL, 'B2'))).toBe(true);
  });

  it('below B1 or no assessed level: never', () => {
    expect(definitionToEn.eligible(purchase, ctx(POOL, 'A2'))).toBe(false);
    expect(definitionToEn.eligible(purchase, ctx(POOL, null))).toBe(false);
    const noLevel = SEEDS.map(
      (seed) =>
        buildVocabCard({ target: purchase, pool: POOL, mode: 'l1_to_en', locale: 'ru', seed }).view
          .mode,
    );
    expect(new Set(noLevel)).toEqual(new Set(['l1_to_en']));
  });

  it.each([
    ['the lemma', verb('decide', { en: 'to decide what to do' })],
    ['a spelling variant', verb('colour', { en: 'to add color to', variants: ['color'] })],
    ['an inflected form', verb('decide', { en: 'what one decides after thinking' })],
    ['a -ing form', verb('stop', { en: 'the act of stopping' })],
    [
      'a form its examples blank',
      verb('run', { en: 'what he ran', examples: [example('He ran home.', 'ran')] }),
    ],
    ['a plural', lex('box', { level: 'B1', en: 'one of the boxes' })],
  ])('a definition that contains %s: not eligible', (_, target) => {
    expect(definitionToEn.eligible(target, ctx([target, ...CLEAN, ...NAMED]))).toBe(false);
  });

  it('an empty definition: not eligible', () => {
    const blank = verb('blank', { en: '   ' });
    expect(definitionToEn.eligible(blank, ctx([blank, ...CLEAN]))).toBe(false);
  });
});

describe('definition_to_en distractors: the pool is filtered once, before picking', () => {
  it('exactly 3 left after the filter: eligible, and none of the 3 occurs in the definition', () => {
    const card = definitionToEn.build({
      target: purchase,
      pool: POOL,
      locale: 'ru',
      seed: 's',
      mode: 'definition_to_en',
    });
    expect(card.view).toMatchObject({
      mode: 'definition_to_en',
      definition: 'to buy goods with money',
    });
    if (card.view.mode !== 'definition_to_en' || card.key.kind !== 'choice')
      throw new Error('choice');
    const { options } = card.view;
    expect(new Set(options)).toEqual(new Set(['purchase', 'sell', 'pay', 'order']));
    for (const option of options.filter((o) => o !== 'purchase')) {
      expect(containsWholeWord(card.view.definition, option), option).toBe(false);
    }
    expect(options[card.key.correctIndex]).toBe('purchase');
  });

  it('fewer than 3 left after the filter: not eligible → the rung serves l1_to_en', () => {
    const pool = POOL.filter((l) => l.lemma !== 'order');
    expect(definitionToEn.eligible(purchase, ctx(pool))).toBe(false);
    for (const seed of SEEDS) expect(rung2(purchase, pool, seed).view.mode).toBe('l1_to_en');
  });
});

describe('the variant inside rung 2 is picked by card seed', () => {
  it('index seedFromString(`${seed}:variant`) mod n over the eligible ones', () => {
    for (const seed of SEEDS) {
      const want = ['l1_to_en', 'definition_to_en'][seedFromString(`${seed}:variant`) % 2];
      expect(rung2(purchase, POOL, seed).view.mode, seed).toBe(want);
    }
  });

  it('both variants occur across seeds, and a seed always gives the same card', () => {
    const modes = new Set(SEEDS.map((seed) => rung2(purchase, POOL, seed).view.mode));
    expect(modes).toEqual(new Set(['l1_to_en', 'definition_to_en']));
    expect(rung2(purchase, POOL, 'x:y:1')).toEqual(rung2(purchase, POOL, 'x:y:1'));
  });

  it('grades by index like every choice card', () => {
    const seed = SEEDS.find((s) => rung2(purchase, POOL, s).view.mode === 'definition_to_en') ?? '';
    const { key } = rung2(purchase, POOL, seed);
    if (key.kind !== 'choice') throw new Error('choice');
    expect(gradeVocabAnswer(key, { kind: 'choice', index: key.correctIndex })).toBe('CORRECT');
    expect(gradeVocabAnswer(key, { kind: 'choice', index: (key.correctIndex + 1) % 4 })).toBe(
      'INCORRECT',
    );
  });
});

describe('surfaceForms', () => {
  it('base, s, ing, past, plural, er, est by every spelling rule', () => {
    expect(surfaceForms(verb('decide'))).toEqual(
      expect.arrayContaining(['decide', 'decides', 'deciding', 'decided']),
    );
    expect(surfaceForms(verb('stop'))).toEqual(
      expect.arrayContaining(['stops', 'stopping', 'stopped']),
    );
    expect(surfaceForms(lex('happy', { pos: 'ADJECTIVE' }))).toEqual(
      expect.arrayContaining(['happier', 'happiest']),
    );
    expect(surfaceForms(lex('box'))).toEqual(expect.arrayContaining(['boxes']));
    expect(surfaceForms(lex('city'))).toEqual(expect.arrayContaining(['cities']));
    expect(surfaceForms(verb('lie'))).toEqual(expect.arrayContaining(['lying', 'lied']));
  });

  it('a multiword lemma inflects its first and its last word', () => {
    expect(surfaceForms(lex('look up', { pos: 'PHRASAL_VERB' }))).toEqual(
      expect.arrayContaining(['look up', 'looks up', 'looking up', 'looked up']),
    );
    expect(surfaceForms(lex('credit card'))).toEqual(expect.arrayContaining(['credit cards']));
  });

  it('adds the forms its own examples blank, and the spelling variants', () => {
    const run = verb('run', { examples: [example('He ran home.', 'ran')], variants: ['runn'] });
    expect(surfaceForms(run)).toEqual(expect.arrayContaining(['ran', 'runn', 'runns']));
  });
});
