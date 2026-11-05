import { describe, expect, it } from 'vitest';
import { makeRng } from '../../policy/rng';
import { buildVocabCard } from '../card';
import {
  glossContentWords,
  glossesOverlap,
  glossOverlapEffect,
  pickDistractors,
} from '../distractors';
import { glossOf } from '../text';
import type { VocabLexeme, VocabLocale } from '../types';
import { lex } from './fixtures';

/**
 * V2-14: in the recognition modes a distractor whose gloss shares a whole
 * content word with the target's gloss is a second right answer
 * («директор / режиссёр» → «директор школы»), so it is filtered out once,
 * before picking; if fewer than three would remain, the unfiltered pick stays.
 */

const work = (lemma: string, o: Parameters<typeof lex>[1] = {}) =>
  lex(lemma, { concept: 'vocab.work.a2', level: 'A2', ...o });

const director = work('director', {
  ru: 'директор / режиссёр',
  uk: 'директор / режисер',
  de: 'der Direktor',
  en: 'a person who manages a company or directs a film',
});
const headteacher = work('headteacher', {
  ru: 'директор школы',
  uk: 'директор школи',
  de: 'der Schulleiter',
  en: 'a person who is in charge of a school',
});
const others = ['farmer', 'nurse', 'pilot', 'waiter'].map((w) => work(w));
const POOL: VocabLexeme[] = [director, headteacher, ...others];

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`);

describe('glossContentWords', () => {
  it('splits on anything but letters, keeps words of 3+ letters, drops stop words', () => {
    expect([...glossContentWords('директор / режиссёр', 'ru')]).toEqual(['директор', 'режиссёр']);
    expect([...glossContentWords('директор школы', 'ru')]).toEqual(['директор', 'школы']);
    expect([...glossContentWords('что-либо (сделать); ой, да', 'ru')]).toEqual(['сделать']);
    expect([...glossContentWords('die Bank', 'de')]).toEqual(['bank']);
    expect([...glossContentWords('sich (D) etw. ansehen', 'de')]).toEqual(['ansehen']);
    // An apostrophe inside a Ukrainian word keeps it whole.
    expect([...glossContentWords('пам’ять', 'uk')]).toEqual(["пам'ять"]);
  });

  it('NFC and case: the same word however it is typed', () => {
    const decomposed = 'Ёлка'.normalize('NFD');
    expect([...glossContentWords(decomposed, 'ru')]).toEqual(['ёлка']);
  });

  it('English is never filtered', () => {
    expect(glossContentWords('a person who manages', 'en').size).toBe(0);
    expect(glossesOverlap(director, headteacher, 'en')).toBe(false);
  });
});

describe('recognition distractors (V2-14)', () => {
  const card = (mode: 'en_to_l1' | 'l1_to_en', locale: VocabLocale, seed: string) =>
    buildVocabCard({ target: director, pool: POOL, mode, locale, seed, learnerLevel: null });

  it('en_to_l1: «директор школы» is never offered for «директор / режиссёр»', () => {
    for (const locale of ['ru', 'uk'] as const) {
      for (const seed of SEEDS) {
        const { view } = card('en_to_l1', locale, seed);
        if (view.mode !== 'en_to_l1') throw new Error('unexpected mode');
        expect(view.options).toHaveLength(4);
        expect(view.options).not.toContain(glossOf(headteacher, locale));
      }
    }
  });

  it('l1_to_en: `headteacher` is never offered for the prompt «директор / режиссёр»', () => {
    for (const seed of SEEDS) {
      const { view } = card('l1_to_en', 'ru', seed);
      if (view.mode !== 'l1_to_en') throw new Error('unexpected mode');
      expect(view.options).toHaveLength(4);
      expect(view.options).not.toContain('headteacher');
    }
  });

  it('a gloss with no whole word in common stays: de `die Bank` vs `die Sitzbank`', () => {
    const bank = work('bank', { de: 'die Bank' });
    const bench = work('bench', { de: 'die Sitzbank' });
    expect(glossesOverlap(bank, bench, 'de')).toBe(false);
    const pool = [bank, bench, ...others];
    const offered = SEEDS.some((seed) => {
      const { view } = buildVocabCard({
        target: bank,
        pool,
        mode: 'en_to_l1',
        locale: 'de',
        seed,
        learnerLevel: null,
      });
      return view.mode === 'en_to_l1' && view.options.includes('die Sitzbank');
    });
    expect(offered).toBe(true);
  });

  it('`en` (definitions) is unaffected: the pick is the unfiltered one', () => {
    for (const seed of SEEDS) {
      const pick = (avoidGlossOverlap: boolean) =>
        pickDistractors({
          target: director,
          pool: POOL,
          locale: 'en',
          rng: makeRng(seed.length * 7919),
          optionOf: (l) => glossOf(l, 'en'),
          targetOption: glossOf(director, 'en'),
          avoidGlossOverlap,
        }).map((d) => d.lexeme.id);
      expect(pick(true)).toEqual(pick(false));
    }
    // The definitions share "person" — offered in English.
    const offered = SEEDS.some((seed) => {
      const { view } = card('en_to_l1', 'en', seed);
      return view.mode === 'en_to_l1' && view.options.includes(glossOf(headteacher, 'en'));
    });
    expect(offered).toBe(true);
  });

  it('fewer than three left after the filter: the unfiltered pick, counted as a fallback', () => {
    // Only two other words: with headteacher out, two distractors would remain.
    const small = [director, headteacher, ...others.slice(0, 2)];
    const args = {
      target: director,
      pool: small,
      locale: 'ru' as const,
      optionOf: (l: VocabLexeme) => glossOf(l, 'ru'),
      targetOption: glossOf(director, 'ru'),
    };
    expect(glossOverlapEffect(args)).toEqual({ removed: 1, fellBack: true });
    for (let seed = 0; seed < 30; seed++) {
      const pick = (avoidGlossOverlap: boolean) =>
        pickDistractors({ ...args, rng: makeRng(seed), avoidGlossOverlap }).map((d) => d.lexeme.id);
      expect(pick(true)).toEqual(pick(false));
      expect(pick(true)).toContain(headteacher.id);
    }
    expect(glossOverlapEffect({ ...args, pool: POOL })).toEqual({ removed: 1, fellBack: false });
  });

  it('no overlap in the pool: the pick is exactly the unfiltered one', () => {
    const pool = [director, ...others];
    for (let seed = 0; seed < 30; seed++) {
      const pick = (avoidGlossOverlap: boolean) =>
        pickDistractors({
          target: director,
          pool,
          locale: 'ru',
          rng: makeRng(seed),
          optionOf: (l) => glossOf(l, 'ru'),
          targetOption: glossOf(director, 'ru'),
          avoidGlossOverlap,
        }).map((d) => d.lexeme.id);
      expect(pick(true)).toEqual(pick(false));
    }
  });

  it('without the option (cloze, definition_to_en) the pool is unchanged', () => {
    // The filter is an option of the recognition variants only.
    const pick = pickDistractors({
      target: director,
      pool: POOL,
      locale: 'ru',
      rng: makeRng(1),
      optionOf: (l) => l.lemma,
      targetOption: director.lemma,
      count: 5,
    }).map((d) => d.lexeme.id);
    expect(pick).toContain(headteacher.id);
  });
});
