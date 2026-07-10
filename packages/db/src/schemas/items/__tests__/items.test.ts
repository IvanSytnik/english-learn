import { describe, expect, it } from 'vitest';

import {
  CollocationContentSchema,
  GrammarPatternContentSchema,
  IdiomContentSchema,
  ItemKindSchema,
  parseItemContent,
  safeParseItemContent,
  VocabWordContentSchema,
} from '../index';

describe('VocabWordContentSchema', () => {
  const valid = {
    source: {
      headword: 'schedule',
      partOfSpeech: 'noun',
      exampleSentence: 'My schedule is full this week.',
      ipa: '/ˈʃɛdjuːl/',
    },
    localized: {
      translation: { en: 'schedule', ru: 'расписание' },
      exampleTranslation: {
        en: 'My schedule is full this week.',
        ru: 'Моё расписание на этой неделе заполнено.',
      },
    },
  };

  it('accepts a well-formed payload', () => {
    expect(VocabWordContentSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts minimal payload (headword + translation only)', () => {
    const minimal = {
      source: { headword: 'cat' },
      localized: { translation: { en: 'cat', ru: 'кот' } },
    };
    expect(VocabWordContentSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects missing EN in translation', () => {
    const bad = {
      source: { headword: 'cat' },
      localized: { translation: { ru: 'кот' } },
    };
    expect(VocabWordContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown partOfSpeech', () => {
    const bad = {
      ...valid,
      source: { ...valid.source, partOfSpeech: 'gerund' },
    };
    expect(VocabWordContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects extra top-level keys (strict)', () => {
    expect(VocabWordContentSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });
});

describe('GrammarPatternContentSchema', () => {
  const valid = {
    source: {
      pattern: 'he/she/it + V-s',
      example: 'She works in a bank.',
      contrastExample: 'She work in a bank. (wrong)',
    },
    localized: {
      explanation: {
        en: 'In Present Simple, third-person singular verbs take -s.',
        ru: 'В Present Simple глаголы в 3-м лице единственного числа получают -s.',
      },
    },
  };

  it('accepts a well-formed payload', () => {
    expect(GrammarPatternContentSchema.safeParse(valid).success).toBe(true);
  });

  it('requires pattern and example', () => {
    const noExample = {
      source: { pattern: 'x' },
      localized: { explanation: { en: 'e' } },
    };
    expect(GrammarPatternContentSchema.safeParse(noExample).success).toBe(false);
  });
});

describe('CollocationContentSchema', () => {
  it('accepts phrasal verb payload', () => {
    const valid = {
      source: { phrase: 'give up', exampleSentence: "Don't give up!" },
      localized: {
        translation: { en: 'to stop trying', ru: 'сдаваться' },
        usageNote: { en: 'Separable: give it up.', ru: 'Разделяемый: give it up.' },
      },
    };
    expect(CollocationContentSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty phrase', () => {
    const bad = {
      source: { phrase: '  ' },
      localized: { translation: { en: 'x' } },
    };
    expect(CollocationContentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('IdiomContentSchema', () => {
  it('accepts a well-formed payload', () => {
    const valid = {
      source: { phrase: 'piece of cake', exampleSentence: 'The test was a piece of cake.' },
      localized: {
        meaning: { en: 'something very easy', ru: 'проще простого' },
      },
    };
    expect(IdiomContentSchema.safeParse(valid).success).toBe(true);
  });
});

describe('parseItemContent (kind dispatch)', () => {
  const vocab = {
    source: { headword: 'cat' },
    localized: { translation: { en: 'cat', ru: 'кот' } },
  };

  it('parses with the schema matching the kind', () => {
    expect(() => parseItemContent('VOCAB_WORD', vocab)).not.toThrow();
  });

  it('throws when content does not match the kind', () => {
    expect(() => parseItemContent('GRAMMAR_PATTERN', vocab)).toThrow();
  });

  it('safeParse returns success=false instead of throwing', () => {
    expect(safeParseItemContent('IDIOM', vocab).success).toBe(false);
  });

  it('ItemKindSchema covers exactly the four kinds', () => {
    expect(ItemKindSchema.options).toEqual([
      'VOCAB_WORD',
      'GRAMMAR_PATTERN',
      'COLLOCATION',
      'IDIOM',
    ]);
  });
});
