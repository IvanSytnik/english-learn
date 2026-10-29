import { describe, expect, it } from 'vitest';
import { ContentStatus, PartOfSpeech } from '../../generated/client/enums';
import {
  ContentStatusSchema,
  CreateDraftLexemeInputSchema,
  CreateLexemeInputSchema,
  cefrLevelOf,
  countWholeWord,
  LexemeExampleSchema,
  LexemeSchema,
  PartOfSpeechSchema,
  TranslationMapSchema,
} from '../lexeme';

const example = (sentence: string, clozeTarget: string) => ({
  sentence,
  translation: { ru: 'перевод' },
  clozeTarget,
});

const input = {
  lemma: 'Run',
  pos: 'VERB',
  cefrLevel: 'A1',
  cefrJLevel: 'A1.2',
  definitions: { en: 'to move quickly on foot' },
  translations: { ru: 'бежать' },
} as const;

describe('lexeme enums', () => {
  it('mirror the Prisma enums', () => {
    expect(PartOfSpeechSchema.options).toEqual(Object.values(PartOfSpeech));
    expect(ContentStatusSchema.options).toEqual(Object.values(ContentStatus));
  });
});

describe('TranslationMapSchema', () => {
  it('accepts any non-empty subset of ru/uk/de', () => {
    expect(TranslationMapSchema.safeParse({ uk: 'бігти' }).success).toBe(true);
  });

  it.each([
    ['an empty map', {}],
    ['an en key', { en: 'run', ru: 'бежать' }],
    ['only blank strings', { ru: '  ' }],
  ])('rejects %s', (_, map) => {
    expect(TranslationMapSchema.safeParse(map).success).toBe(false);
  });
});

describe('LexemeExampleSchema clozeTarget', () => {
  it.each([
    ['an inflected form', 'She ran to the station.', 'ran'],
    ['a different case', 'Run!', 'run'],
    ['a multi-word target', 'Please look it up now.', 'look it up'],
    ['a target next to punctuation', '"Ran," he said.', 'ran'],
  ])('accepts %s', (_, sentence, target) => {
    expect(LexemeExampleSchema.safeParse(example(sentence, target)).success).toBe(true);
  });

  it.each([
    ['a missing target', 'She walked home.', 'ran'],
    ['a target inside another word', 'The rant went on.', 'ran'],
    ['a target that ends another word', 'They flew to Iran.', 'ran'],
    ['a target that occurs twice', 'Run, run, run!', 'run'],
    ['a target inside a non-ASCII word', 'Il a couru à Ranéville.', 'ran'],
  ])('rejects %s', (_, sentence, target) => {
    const result = LexemeExampleSchema.safeParse(example(sentence, target));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['clozeTarget']);
  });

  it('treats regex characters in the target literally', () => {
    expect(countWholeWord('a.b and axb', 'a.b')).toBe(1);
  });
});

describe('cefrLevelOf', () => {
  it.each([
    ['PreA1', 'A1'],
    ['A1', 'A1'],
    ['A1.3', 'A1'],
    ['B1', 'B1'],
    ['B2.1', 'B2'],
    ['C2', 'C2'],
  ] as const)('%s sits in %s', (j, level) => {
    expect(cefrLevelOf(j)).toBe(level);
  });
});

describe('CreateLexemeInputSchema', () => {
  it('derives lemmaKey and fills the defaults', () => {
    expect(CreateLexemeInputSchema.parse({ ...input, lemma: '  Run ' })).toMatchObject({
      lemma: 'Run',
      lemmaKey: 'run',
      sense: '',
      examples: [],
      collocations: [],
      status: 'DRAFT',
    });
  });

  it('rejects a cefrJLevel outside cefrLevel', () => {
    const result = CreateLexemeInputSchema.safeParse({ ...input, cefrJLevel: 'A2.1' });
    expect(result.error?.issues[0]?.path).toEqual(['cefrJLevel']);
  });

  it('does not accept a caller-supplied lemmaKey', () => {
    expect(CreateLexemeInputSchema.safeParse({ ...input, lemmaKey: 'x' }).success).toBe(false);
  });
});

describe('CreateDraftLexemeInputSchema', () => {
  const draft = { ...input, cefrJLevel: 'A1', definitions: {}, translations: {} } as const;

  it('accepts a DRAFT without definitions or translations', () => {
    expect(CreateDraftLexemeInputSchema.parse(draft)).toMatchObject({
      lemmaKey: 'run',
      definitions: {},
      translations: {},
      status: 'DRAFT',
    });
  });

  it('still validates a gloss that is present', () => {
    expect(
      CreateDraftLexemeInputSchema.safeParse({ ...draft, definitions: { ru: 'x' } }).success,
    ).toBe(false);
    expect(
      CreateDraftLexemeInputSchema.safeParse({ ...draft, translations: { en: 'x' } }).success,
    ).toBe(false);
  });

  it.each(['REVIEW', 'PUBLISHED'])('rejects status %s', (status) => {
    expect(CreateDraftLexemeInputSchema.safeParse({ ...draft, status }).success).toBe(false);
  });
});

describe('LexemeSchema', () => {
  it('rejects a stored row whose lemmaKey is not the normalized lemma', () => {
    const result = LexemeSchema.safeParse({ ...input, id: 'lx1', lemmaKey: 'Run' });
    expect(result.error?.issues[0]?.path).toEqual(['lemmaKey']);
  });

  it('accepts a consistent stored row', () => {
    expect(LexemeSchema.safeParse({ ...input, id: 'lx1', lemmaKey: 'run' }).success).toBe(true);
  });
});
