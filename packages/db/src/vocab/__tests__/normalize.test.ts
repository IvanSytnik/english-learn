import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CEFR_J_POS,
  dedupeLexemes,
  deriveCefrLevel,
  mapCefrJPos,
  type NormalizedLexemeEntry,
  normalizeDataset,
  normalizeEntry,
  normalizeLemma,
} from '../normalize';

const lexeme = (extra: Partial<NormalizedLexemeEntry> = {}): NormalizedLexemeEntry => ({
  lemma: 'run',
  lemmaKey: 'run',
  pos: 'VERB',
  sense: '',
  cefrLevel: 'A1',
  cefrJLevel: 'A1',
  topic: 'general',
  variants: [],
  ...extra,
});

const dataset = (entries: unknown[]) => ({
  source: {
    name: 'CEFR-J Wordlist',
    version: '1.5',
    citation: 'c',
    url: 'https://example.org/cefrj.csv',
    terms: 't',
    selection: 's',
    topics: 'x',
  },
  entries,
});

describe('normalizeLemma', () => {
  it('trims the ends and keeps the display case; lemmaKey is lower-case', () => {
    expect(normalizeLemma('  Apple ')).toEqual({ lemma: 'Apple', lemmaKey: 'apple' });
  });

  it('collapses inner whitespace runs, tabs and newlines included', () => {
    expect(normalizeLemma('\tlook \n  up ')).toEqual({ lemma: 'look up', lemmaKey: 'look up' });
  });

  it('composes to NFC, so a decomposed é is the same key', () => {
    expect(normalizeLemma('café').lemmaKey).toBe(normalizeLemma('café').lemmaKey);
  });

  it.each(["o'clock", 'a.m.', 'brand-new', 'TV'])('accepts %j', (raw) => {
    expect(normalizeLemma(raw).lemma).toBe(raw);
  });

  it.each(['', '   ', '-run', 'run/walk', 'run,', 'r​un'])('rejects %j', (raw) => {
    expect(() => normalizeLemma(raw)).toThrow(/Invalid lemma/);
  });

  // The Lexeme_lemmaKey_normalized CHECK: Postgres btrim strips spaces only,
  // so a normalized lemma must have nothing else at its ends.
  it('yields lemmaKey = lower(btrim(lemma)) and is idempotent', () => {
    const btrim = (s: string) => s.replace(/^ +| +$/g, '');
    const word = fc.stringMatching(/^[A-Za-z][A-Za-z .'-]{0,15}$/);
    const pad = fc.constantFrom('', ' ', '\t', '\n ', ' ');
    fc.assert(
      fc.property(pad, word, pad, (left, w, right) => {
        const { lemma, lemmaKey } = normalizeLemma(`${left}${w}${right}`);
        expect(lemmaKey).toBe(btrim(lemma).toLowerCase());
        expect(normalizeLemma(lemma).lemma).toBe(lemma);
      }),
    );
  });
});

describe('mapCefrJPos', () => {
  it.each([
    ['noun', 'NOUN'],
    ['verb', 'VERB'],
    ['adjective', 'ADJECTIVE'],
    ['adverb', 'ADVERB'],
    ['pronoun', 'PRONOUN'],
    ['preposition', 'PREPOSITION'],
    ['conjunction', 'CONJUNCTION'],
    ['interjection', 'INTERJECTION'],
    ['number', 'OTHER'],
  ])('maps %s to %s', (tag, pos) => {
    expect(mapCefrJPos(tag)).toBe(pos);
  });

  it.each([
    'determiner',
    'modal auxiliary',
    'be-verb',
    'do-verb',
    'have-verb',
    'infinitive-to',
  ])('leaves out the closed class %s', (tag) => {
    expect(mapCefrJPos(tag)).toBeNull();
  });

  it('covers every tag in the table and ignores case and padding', () => {
    expect(Object.keys(CEFR_J_POS)).toHaveLength(15);
    expect(mapCefrJPos(' Noun ')).toBe('NOUN');
  });

  it.each(['n', 'phrasal verb', 'toString', ''])('throws on the unknown tag %j', (tag) => {
    expect(() => mapCefrJPos(tag)).toThrow(/Unknown CEFR-J part of speech/);
  });
});

describe('deriveCefrLevel', () => {
  it.each([
    ['A1', 'A1'],
    ['A1.1', 'A1'],
    ['A1.3', 'A1'],
    ['A2.2', 'A2'],
    ['B1', 'B1'],
    ['B1.2', 'B1'],
    ['PreA1', 'A1'],
  ])('%s → %s', (cefrJ, level) => {
    expect(deriveCefrLevel(cefrJ)).toBe(level);
  });

  it.each(['B1.3', 'A3', 'A1.4', 'a1', ' A1', 'A1.', ''])('rejects %j', (cefrJ) => {
    expect(() => deriveCefrLevel(cefrJ)).toThrow(/Invalid CEFR-J level/);
  });
});

describe('normalizeEntry', () => {
  it('builds the Lexeme columns and the topic', () => {
    expect(
      normalizeEntry({
        lemma: ' Behavior ',
        variants: ['behaviour'],
        pos: 'noun',
        cefrJLevel: 'A2',
        topic: 'relations',
      }),
    ).toEqual({
      lemma: 'Behavior',
      lemmaKey: 'behavior',
      pos: 'NOUN',
      sense: '',
      cefrLevel: 'A2',
      cefrJLevel: 'A2',
      topic: 'relations',
      variants: ['behaviour'],
    });
  });

  it('falls back to the general topic', () => {
    expect(normalizeEntry({ lemma: 'run', pos: 'verb', cefrJLevel: 'A1' })?.topic).toBe('general');
  });

  it('throws on an unknown topic instead of falling back', () => {
    expect(() =>
      normalizeEntry({ lemma: 'run', pos: 'verb', cefrJLevel: 'A1', topic: 'sport' }),
    ).toThrow(/Unknown vocabulary topic/);
  });

  it('returns null for a part of speech left out', () => {
    expect(normalizeEntry({ lemma: 'the', pos: 'determiner', cefrJLevel: 'A1' })).toBeNull();
  });
});

describe('dedupeLexemes', () => {
  it('folds the same word listed twice into its lowest level, merging variants', () => {
    const result = dedupeLexemes([
      lexeme({ cefrLevel: 'B1', cefrJLevel: 'B1', topic: 'travel', variants: ['runn'] }),
      lexeme({ cefrJLevel: 'A1.2', topic: 'free_time', variants: ['rn'] }),
    ]);
    expect(result).toEqual([
      lexeme({ cefrJLevel: 'A1.2', topic: 'free_time', variants: ['rn', 'runn'] }),
    ]);
  });

  it('keeps the first entry on a tie', () => {
    const result = dedupeLexemes([lexeme({ topic: 'travel' }), lexeme({ topic: 'weather' })]);
    expect(result).toEqual([lexeme({ topic: 'travel' })]);
  });

  it('keeps entries apart by part of speech and by sense', () => {
    const result = dedupeLexemes([
      lexeme(),
      lexeme({ pos: 'NOUN' }),
      lexeme({ pos: 'NOUN', sense: 'race' }),
    ]);
    expect(result).toHaveLength(3);
  });

  it('throws on two display forms of one key without a sense (March / march)', () => {
    const march = { lemmaKey: 'march', pos: 'NOUN' } as const;
    expect(() =>
      dedupeLexemes([
        lexeme({ ...march, lemma: 'March' }),
        lexeme({ ...march, lemma: 'march', cefrLevel: 'B1', cefrJLevel: 'B1' }),
      ]),
    ).toThrow(/"March" \/ "march" \(NOUN\) needs a sense/);
    expect(
      dedupeLexemes([
        lexeme({ ...march, lemma: 'March', sense: 'month' }),
        lexeme({ ...march, lemma: 'march', sense: 'walk', cefrLevel: 'B1', cefrJLevel: 'B1' }),
      ]),
    ).toHaveLength(2);
  });
});

describe('normalizeDataset', () => {
  it('validates, normalizes and reports the rows left out', () => {
    const result = normalizeDataset(
      dataset([
        { lemma: 'run', pos: 'verb', cefrJLevel: 'A1', topic: 'free_time', topicSource: 'llm' },
        { lemma: ' run ', pos: 'verb', cefrJLevel: 'A2' },
        { lemma: 'the', pos: 'determiner', cefrJLevel: 'A1' },
      ]),
    );
    expect(result.lexemes).toEqual([lexeme({ topic: 'free_time' })]);
    expect(result.skipped).toEqual([{ lemma: 'the', pos: 'determiner' }]);
  });

  it('rejects a row with an unknown field', () => {
    expect(() =>
      normalizeDataset(dataset([{ lemma: 'run', pos: 'verb', cefrJLevel: 'A1', level: 'A1' }])),
    ).toThrow();
  });
});
