import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { seedFromString } from '../../policy/rng';
import { buildVocabCard, pickVariantIndex } from '../card';
import { gradeVocabAnswer } from '../grade';
import type { VocabLexeme } from '../types';
import { collocation, gappableCollocations } from '../variants/collocation';
import { lex } from './fixtures';

/** B6.5 `collocation` (mode 3, B1+): which collocations gap, the seeded pick, the fallback. */

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

const rung3 = (target: VocabLexeme, seed: string, learnerLevel: 'A2' | 'B1' | null = 'B1') =>
  buildVocabCard({ target, pool: POOL, mode: 'cloze', locale: 'ru', seed, learnerLevel });

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
  it('a B1+ learner: the cloze rung serves cloze or collocation, by card seed', () => {
    // Every collocation fair, so the collocation card fits whatever the seed.
    const fair = noun('decision', { collocations: ['make a decision', 'a big decision today'] });
    const modes = SEEDS.map((seed) => rung3(fair, seed).view.mode);
    expect(new Set(modes)).toEqual(new Set(['cloze', 'collocation']));
    for (const seed of SEEDS) {
      const want = ['cloze', 'collocation'][pickVariantIndex(seed, 2)];
      expect(rung3(fair, seed).view.mode, seed).toBe(want);
    }
  });

  it('the collocation picked for a seed decides eligibility: an unfair pick → cloze', () => {
    // `decision`: the seed picks "make a decision" (fair) or "tough decisions" (plural, unfair).
    for (const seed of SEEDS) {
      const pick = gappableCollocations(decision)[seedFromString(seed) % 2]?.phrase;
      const ctx = { pool: POOL, locale: 'ru' as const, seed, learnerLevel: 'B1' as const };
      expect(collocation.eligible(decision, ctx), seed).toBe(pick === 'make a decision');
    }
  });

  it('below B1 or no level: never', () => {
    for (const seed of SEEDS) {
      expect(rung3(decision, seed, 'A2').view.mode).toBe('cloze');
      expect(rung3(decision, seed, null).view.mode).toBe('cloze');
    }
    expect(collocation.eligible(decision, { pool: POOL, locale: 'ru', seed: 's' })).toBe(false);
  });

  it('picks the collocation at seedFromString(cardSeed) mod n, gaps it, article taken in', () => {
    const word = noun('decision', { collocations: ['make a decision', 'a big decision today'] });
    const phrases = new Set<string>();
    for (const seed of SEEDS) {
      const card = buildVocabCard({
        target: word,
        pool: POOL,
        mode: 'cloze',
        locale: 'ru',
        seed,
        learnerLevel: 'B2',
      });
      if (card.view.mode !== 'collocation' || card.key.kind !== 'choice') continue;
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
    expect(rung3(decision, 'x:y:3')).toEqual(rung3(decision, 'x:y:3'));
  });

  it('fewer than 3 shape-matched distractors: not eligible → cloze as today', () => {
    // Only a plural gaps, and no other noun has a plural form to offer.
    const plural = noun('decision', { collocations: ['tough decisions'] });
    expect(
      collocation.eligible(plural, { pool: POOL, locale: 'ru', seed: 's', learnerLevel: 'B1' }),
    ).toBe(false);
    for (const seed of SEEDS) expect(rung3(plural, seed).view.mode).toBe('cloze');
  });

  it('no gappable collocation: not eligible', () => {
    const none = noun('decision', { collocations: ['decision', 'decisions, decisions'] });
    expect(
      collocation.eligible(none, { pool: POOL, locale: 'ru', seed: 's', learnerLevel: 'B1' }),
    ).toBe(false);
  });
});
