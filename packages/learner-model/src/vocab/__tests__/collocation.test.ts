import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { seedFromString } from '../../policy/rng';
import { buildVocabCard } from '../card';
import { gradeVocabAnswer } from '../grade';
import type { VocabLexeme } from '../types';
import { HELD_BACK_VARIANTS } from '../variants';
import { collocation, gappableCollocations } from '../variants/collocation';
import { lex } from './fixtures';

/**
 * B6.5 `collocation` (mode 3, B1+): which collocations gap, the seeded pick,
 * eligibility. Held back from its rung (HELD_BACK_VARIANTS), so the module is
 * tested directly; buildVocabCard on the cloze rung serves cloze.
 */

const noun = (lemma: string, opts: Parameters<typeof lex>[1] = {}) =>
  lex(lemma, { level: 'B1', concept: 'vocab.work.b1', ...opts });

const decision = noun('decision', {
  collocations: [
    'make a decision',
    'decisions, decisions',
    'decision',
    'reach a verdict',
    'tough decisions',
  ],
});
const POOL = [decision, noun('answer'), noun('choice'), noun('plan'), noun('idea')];
const SEEDS = Array.from({ length: 40 }, (_, i) => `u:i:${i}`);

const ctx = (seed: string, learnerLevel: 'A2' | 'B1' | 'B2' | null = 'B1') => ({
  pool: POOL,
  locale: 'ru' as const,
  seed,
  learnerLevel,
});
const build = (target: VocabLexeme, seed: string) =>
  collocation.build({ target, pool: POOL, locale: 'ru', seed, mode: 'collocation' });

describe('gappableCollocations', () => {
  it('keeps the word exactly once as a whole word plus another word, in stored order', () => {
    expect(gappableCollocations(decision)).toEqual([
      { phrase: 'make a decision', form: 'decision' },
      { phrase: 'tough decisions', form: 'decisions' },
    ]);
  });

  it('a multiword lemma, an inflected verb, a capitalized form', () => {
    expect(
      gappableCollocations(
        lex('look up', { pos: 'PHRASAL_VERB', collocations: ['looked up the word'] }),
      ),
    ).toEqual([{ phrase: 'looked up the word', form: 'looked up' }]);
    expect(
      gappableCollocations(lex('decide', { pos: 'VERB', collocations: ['She decided quickly'] })),
    ).toEqual([{ phrase: 'She decided quickly', form: 'decided' }]);
    expect(gappableCollocations(lex('tv', { collocations: ['watch TV'] }))).toEqual([
      { phrase: 'watch TV', form: 'TV' },
    ]);
  });

  it('none stored: none', () => {
    expect(gappableCollocations(noun('plan'))).toEqual([]);
  });
});

describe('the collocation card', () => {
  it('held back: the cloze rung serves cloze to every level, even where collocation fits', () => {
    expect(HELD_BACK_VARIANTS.has('collocation')).toBe(true);
    const fair = noun('decision', { collocations: ['make a decision', 'a big decision today'] });
    for (const seed of SEEDS) {
      expect(collocation.eligible(fair, ctx(seed, 'B2')), seed).toBe(true);
      for (const learnerLevel of [null, 'A2', 'B1', 'B2'] as const) {
        const card = buildVocabCard({ target: fair, mode: 'cloze', ...ctx(seed, learnerLevel) });
        expect(card.view.mode, `${seed} ${learnerLevel}`).toBe('cloze');
      }
    }
  });

  it('a B1+ learner and a fair collocation: eligible whatever the seed', () => {
    const fair = noun('decision', { collocations: ['make a decision', 'a big decision today'] });
    for (const seed of SEEDS) {
      expect(collocation.eligible(fair, ctx(seed, 'B1')), seed).toBe(true);
      expect(build(fair, seed).view.mode, seed).toBe('collocation');
    }
  });

  it('the collocation picked for a seed decides eligibility: an unfair pick → not eligible', () => {
    // `decision`: the seed picks "make a decision" (fair) or "tough decisions" (plural, unfair).
    for (const seed of SEEDS) {
      const pick = gappableCollocations(decision)[seedFromString(seed) % 2]?.phrase;
      expect(collocation.eligible(decision, ctx(seed)), seed).toBe(pick === 'make a decision');
    }
  });

  it('below B1 or no level: never eligible', () => {
    for (const seed of SEEDS) {
      expect(collocation.eligible(decision, ctx(seed, 'A2'))).toBe(false);
      expect(collocation.eligible(decision, ctx(seed, null))).toBe(false);
    }
    expect(collocation.eligible(decision, { pool: POOL, locale: 'ru', seed: 's' })).toBe(false);
  });

  it('picks the collocation at seedFromString(cardSeed) mod n, gaps it, article taken in', () => {
    const word = noun('decision', { collocations: ['make a decision', 'a big decision today'] });
    const phrases = new Set<string>();
    for (const seed of SEEDS) {
      const card = build(word, seed);
      if (card.view.mode !== 'collocation' || card.key.kind !== 'choice') throw new Error(seed);
      const want = ['make a decision', 'a big decision today'][seedFromString(seed) % 2];
      expect(card.view.phrase, seed).toBe(
        want === 'make a decision' ? `make ${PRACTICE_GAP}` : `a big ${PRACTICE_GAP} today`,
      );
      phrases.add(card.view.phrase);
      const right = card.view.options[card.key.correctIndex];
      expect(right).toBe(want === 'make a decision' ? 'a decision' : 'decision');
      expect(gradeVocabAnswer(card.key, { kind: 'choice', index: card.key.correctIndex })).toBe(
        'CORRECT',
      );
    }
    expect(phrases.size).toBe(2);
  });

  it('is deterministic: the same seed, the same card', () => {
    const fair = noun('decision', { collocations: ['make a decision'] });
    expect(build(fair, 'x:y:3')).toEqual(build(fair, 'x:y:3'));
  });

  it('fewer than 3 shape-matched distractors: not eligible, and build refuses', () => {
    // Only a plural gaps, and no other noun has a plural form to offer.
    const plural = noun('decision', { collocations: ['tough decisions'] });
    for (const seed of SEEDS) expect(collocation.eligible(plural, ctx(seed))).toBe(false);
    expect(() => build(plural, 's')).toThrow();
  });

  it('no gappable collocation: not eligible', () => {
    const none = noun('decision', { collocations: ['decision', 'decisions, decisions'] });
    expect(collocation.eligible(none, ctx('s'))).toBe(false);
  });
});
