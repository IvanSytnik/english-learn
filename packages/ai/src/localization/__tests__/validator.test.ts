import { describe, expect, it } from 'vitest';
import type { PendingLexeme, WireLocalizationItem } from '../types';
import { glossWordCount, validateLocalizedBatch } from '../validator';

const pending = (
  key: string,
  lemma: string,
  extra: Partial<PendingLexeme> = {},
): PendingLexeme => ({
  id: `id-${key}`,
  key,
  lemma,
  pos: 'NOUN',
  sense: '',
  cefrLevel: 'A1',
  topic: 'food_drink',
  ...extra,
});

const EXAMPLE = {
  sentence: 'I eat an apple every day.',
  clozeTarget: 'apple',
  translation: {
    ru: 'Я ем яблоко каждый день.',
    uk: 'Я їм яблуко щодня.',
    de: 'Ich esse jeden Tag einen Apfel.',
  },
};

const answer = (key: string, extra: Partial<WireLocalizationItem> = {}): WireLocalizationItem => ({
  key,
  lemma: 'apple',
  definitionEn: 'a round fruit with red or green skin',
  translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
  examples: [EXAMPLE],
  collocations: ['apple pie'],
  ...extra,
});

const run = (items: WireLocalizationItem[], requested = [pending('1', 'apple')]) =>
  validateLocalizedBatch(requested, { items });

const reasonsOf = (items: WireLocalizationItem[], requested?: PendingLexeme[]) =>
  run(items, requested).rejected.flatMap((r) => r.reasons);

describe('validateLocalizedBatch', () => {
  it('accepts a valid item in the Lexeme column shapes', () => {
    expect(run([answer('1')])).toEqual({
      accepted: [
        {
          id: 'id-1',
          lemma: 'apple',
          pos: 'NOUN',
          sense: '',
          definitions: { en: 'a round fruit with red or green skin' },
          translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
          examples: answer('1').examples,
          collocations: ['apple pie'],
        },
      ],
      rejected: [],
    });
  });

  it.each(['ru', 'uk', 'de'] as const)('rejects an item without the %s translation', (locale) => {
    const translations = { ...answer('1').translations, [locale]: ' ' };
    expect(reasonsOf([answer('1', { translations })])).toEqual(
      expect.arrayContaining([expect.stringMatching(`translations.${locale}`)]),
    );
  });

  it.each([
    ['missing from the sentence', 'I eat a pear every day.', 'apple'],
    ['inside another word', 'Pineapples are sweet.', 'apple'],
    ['twice in the sentence', 'An apple a day, an apple a week.', 'apple'],
    ['inside a non-ASCII word', 'Wir essen Äpplechen.', 'pple'],
  ])('rejects a clozeTarget %s', (_, sentence, clozeTarget) => {
    const examples = [{ ...EXAMPLE, sentence, clozeTarget }];
    expect(reasonsOf([answer('1', { examples })])).toEqual([
      'examples.0.clozeTarget: clozeTarget must occur in the sentence exactly once, as a whole word',
    ]);
  });

  it('accepts an inflected clozeTarget that occurs once', () => {
    const examples = [{ ...EXAMPLE, sentence: 'She ate two apples.', clozeTarget: 'apples' }];
    expect(run([answer('1', { examples })]).accepted).toHaveLength(1);
  });

  it('rejects an item without examples, or with more than three', () => {
    expect(reasonsOf([answer('1', { examples: [] })])).toEqual([
      expect.stringMatching(/^examples:/),
    ]);
    const four = Array.from({ length: 4 }, () => EXAMPLE);
    expect(reasonsOf([answer('1', { examples: four })])).toEqual([
      expect.stringMatching(/^examples:/),
    ]);
  });

  it('keeps the valid items of a batch when one item is bad', () => {
    const requested = [pending('1', 'apple'), pending('2', 'apple'), pending('3', 'apple')];
    const result = run(
      [
        answer('1'),
        answer('2', { translations: { ru: 'яблоко', uk: '', de: 'der Apfel' } }),
        answer('3'),
      ],
      requested,
    );
    expect(result.accepted.map((a) => a.id)).toEqual(['id-1', 'id-3']);
    expect(result.rejected.map((r) => r.id)).toEqual(['id-2']);
  });

  it('rejects requested items the model did not answer, answered twice, or answered for another word', () => {
    const requested = [pending('1', 'apple'), pending('2', 'apple'), pending('3', 'apple')];
    const result = run([answer('1'), answer('1'), answer('3', { lemma: 'pear' })], requested);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((r) => [r.id, r.reasons])).toEqual([
      ['id-1', ['answered more than once']],
      ['id-2', ['not answered']],
      ['id-3', ['answered for "pear"']],
    ]);
  });

  it('rejects every item when the response is not the wire shape', () => {
    const result = validateLocalizedBatch([pending('1', 'apple')], { words: [] });
    expect(result.rejected).toEqual([
      { id: 'id-1', lemma: 'apple', reasons: ['response does not match the wire schema'] },
    ]);
  });

  describe('gloss rules', () => {
    const withTranslations = (t: Partial<WireLocalizationItem['translations']>, extra = {}) =>
      reasonsOf([answer('1', { translations: { ...answer('1').translations, ...t }, ...extra })]);

    it('rejects a gloss longer than three words', () => {
      expect(withTranslations({ ru: 'круглый сладкий садовый плод' })).toEqual([
        'translations.ru is longer than 3 words',
      ]);
    });

    it('rejects a definition-like gloss', () => {
      expect(withTranslations({ ru: 'плод (фрукт)' })).toEqual([
        'translations.ru is not a bare gloss',
      ]);
    });

    it('requires der/die/das on a German noun, not on other parts of speech', () => {
      expect(withTranslations({ de: 'Apfel' })).toEqual([
        'translations.de must start with der/die/das',
      ]);
      const verb = [pending('1', 'run', { pos: 'VERB' })];
      const run_ = answer('1', {
        lemma: 'run',
        definitionEn: 'to move fast on foot',
        translations: { ru: 'бегать / бежать', uk: 'бігти', de: 'laufen' },
        examples: [
          {
            sentence: 'She ran to the bus.',
            clozeTarget: 'ran',
            translation: {
              ru: 'Она побежала к автобусу.',
              uk: 'Вона побігла до автобуса.',
              de: 'Sie lief zum Bus.',
            },
          },
        ],
      });
      expect(run([run_], verb).accepted).toHaveLength(1);
    });

    it('lets a listed form of address or phrase-bound noun go without an article', () => {
      const mr = answer('1', {
        lemma: 'Mr.',
        definitionEn: 'a title used before a man’s family name',
        translations: { ru: 'господин', uk: 'пан', de: 'Herr' },
        examples: [
          {
            sentence: 'Mr. Brown is our teacher.',
            clozeTarget: 'Mr',
            translation: {
              ru: 'Господин Браун — наш учитель.',
              uk: 'Пан Браун — наш учитель.',
              de: 'Herr Brown ist unser Lehrer.',
            },
          },
        ],
      });
      expect(run([mr], [pending('1', 'Mr.')]).accepted).toHaveLength(1);
      expect(
        run([{ ...mr, lemma: 'apple' }], [pending('1', 'apple')]).rejected[0]?.reasons,
      ).toContain('translations.de must start with der/die/das');
    });

    it('catches Russian in the Ukrainian field and Ukrainian in the Russian one', () => {
      expect(withTranslations({ uk: 'яблоко съедобное' })).toEqual([
        'translations.uk is not Ukrainian',
      ]);
      expect(withTranslations({ ru: 'їжа' })).toEqual(['translations.ru is not Russian']);
      expect(withTranslations({ de: 'der яблоко' })).toEqual(['translations.de is not German']);
    });

    it('checks the script of example translations too', () => {
      const ex = EXAMPLE;
      const examples = [
        { ...ex, translation: { ...ex.translation, uk: 'Я ем яблоко каждый день.' } },
      ];
      expect(reasonsOf([answer('1', { examples })])).toEqual([
        'examples.0.translation.uk is not Ukrainian',
      ]);
    });

    it('rejects a definition that gives the word away', () => {
      expect(reasonsOf([answer('1', { definitionEn: 'an apple is a fruit' })])).toEqual([
        'definitions.en gives the word away',
      ]);
    });
  });
});

describe('glossWordCount', () => {
  it.each([
    ['яблоко', 1],
    ['der Apfel', 1],
    ['делать / сделать', 2],
    ['бежать, бегать', 2],
    ['  look   up  ', 2],
    ['die Vereinigten Staaten von', 3],
    ['круглый сладкий садовый плод', 4],
  ])('%j has %i words', (gloss, n) => {
    expect(glossWordCount(gloss)).toBe(n);
  });
});
