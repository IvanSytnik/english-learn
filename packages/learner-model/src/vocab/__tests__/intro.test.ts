import { describe, expect, it } from 'vitest';
import { buildVocabIntro, INTRO_COLLOCATIONS } from '../intro';
import { rotatedExample } from '../variants/shared';
import { example, lex } from './fixtures';

/** B6.5 intro card (mode 0): what a new word shows before its first question. */

const lamp = {
  ...lex('lamp', {
    ru: 'лампа',
    en: 'a device that gives light',
    examples: [
      example('She bought this lamp yesterday.', 'lamp'),
      example('The lamp in the hall is broken.', 'lamp'),
      example('Turn the lamp off, please.', 'lamp'),
    ],
    collocations: ['desk lamp', 'turn on the lamp', 'a bright lamp'],
  }),
  ipa: 'ˈlæmp',
};

describe('buildVocabIntro', () => {
  it('below B1 (or no level): the word, POS, IPA, the gloss in the learner’s language', () => {
    for (const learnerLevel of [null, 'A1', 'A2'] as const) {
      expect(buildVocabIntro(lamp, { locale: 'ru', learnerLevel, seed: 's' })).toMatchObject({
        word: 'lamp',
        pos: 'NOUN',
        ipa: 'ˈlæmp',
        meaning: { kind: 'gloss', text: 'лампа' },
      });
    }
  });

  it('B1+: the English definition instead of the gloss', () => {
    for (const learnerLevel of ['B1', 'B2', 'C1'] as const) {
      expect(buildVocabIntro(lamp, { locale: 'ru', learnerLevel, seed: 's' }).meaning).toEqual({
        kind: 'definition',
        text: 'a device that gives light',
      });
    }
  });

  it('a learner with no gloss language (`en`): the definition, marked as English', () => {
    expect(buildVocabIntro(lamp, { locale: 'en', learnerLevel: null, seed: 's' })).toMatchObject({
      meaning: { kind: 'definition', text: 'a device that gives light' },
      example: { translation: null },
    });
  });

  it('one example, the one the card seed rotates to, with its translation', () => {
    for (const seed of ['u:i:new', 'v:j:new', 'w:k:new']) {
      const intro = buildVocabIntro(lamp, { locale: 'ru', learnerLevel: null, seed });
      expect(intro.example).toEqual({
        sentence: rotatedExample(lamp, seed)?.sentence,
        translation: 'x',
      });
    }
  });

  it(`at most ${INTRO_COLLOCATIONS} collocations, in stored order; none stored → none`, () => {
    const intro = buildVocabIntro(lamp, { locale: 'ru', learnerLevel: null, seed: 's' });
    expect(intro.collocations).toEqual(['desk lamp', 'turn on the lamp']);
    const bare = buildVocabIntro(lex('cup'), { locale: 'ru', learnerLevel: null, seed: 's' });
    expect(bare.collocations).toEqual([]);
    expect(bare.ipa).toBeNull();
  });

  it('carries no answer key, no ids, no options', () => {
    const json = JSON.stringify(
      buildVocabIntro(lamp, { locale: 'ru', learnerLevel: 'B1', seed: 's' }),
    );
    for (const key of ['options', 'correctIndex', 'lexemeId', 'id', 'accepted']) {
      expect(json).not.toContain(`"${key}"`);
    }
    expect(json).not.toContain(lamp.id);
  });
});
