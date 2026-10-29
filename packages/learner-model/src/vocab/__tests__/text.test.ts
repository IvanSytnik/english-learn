import { describe, expect, it } from 'vitest';
import {
  articleFor,
  findClozeSpan,
  matchInitialCase,
  normalizeAnswer,
  recallCue,
  surfaceShape,
} from '../text';

describe('recallCue', () => {
  it.each([
    ['look up', 'l___ u_'],
    ['apple', 'a____'],
    ['brand-new', 'b____-___'],
    ['a.m.', 'a._.'],
    ["o'clock", "o'_____"],
    ['I', 'I'],
  ])('%s -> %s', (lemma, cue) => {
    expect(recallCue(lemma)).toBe(cue);
  });
});

describe('articleFor', () => {
  it.each([
    ['apple', 'an'],
    ['pear', 'a'],
    ['umbrella', 'an'],
    ['hour', 'an'],
    ['honest', 'an'],
    ['university', 'a'],
    ['European', 'a'],
    ['one', 'a'],
    ['house', 'a'],
  ])('%s -> %s', (word, article) => {
    expect(articleFor(word)).toBe(article);
  });
});

describe('surfaceShape', () => {
  it.each([
    ['run', 'run', 'VERB', 'base'],
    ['Run', 'run', 'VERB', 'base'],
    ['ran', 'run', 'VERB', 'past'],
    ['walked', 'walk', 'VERB', 'past'],
    ['runs', 'run', 'VERB', 's'],
    ['running', 'run', 'VERB', 'ing'],
    ['beans', 'bean', 'NOUN', 'plural'],
    ['children', 'child', 'NOUN', 'plural'],
    ['bigger', 'big', 'ADJECTIVE', 'er'],
    ['biggest', 'big', 'ADJECTIVE', 'est'],
    ['evening', 'evening', 'NOUN', 'base'],
  ] as const)('%s of %s (%s) -> %s', (form, lemmaKey, pos, shape) => {
    expect(surfaceShape(form, lemmaKey, pos)).toBe(shape);
  });
});

describe('findClozeSpan', () => {
  it('finds the whole word only (not inside Iran)', () => {
    const s = 'In Iran we ran home.';
    const span = findClozeSpan(s, 'ran');
    expect(s.slice(span.start, span.end)).toBe('ran');
    expect(span.article).toBeNull();
  });

  it('takes in the article right before the word', () => {
    const s = 'An apple a day.';
    expect(findClozeSpan(s, 'apple').article).toEqual({ text: 'An', start: 0 });
    expect(findClozeSpan('I ate an  apple.', 'apple').article).toEqual({ text: 'an', start: 6 });
  });

  it('does not mistake a word ending in "a" for an article', () => {
    expect(findClozeSpan('I had pizza apple pie.', 'apple').article).toBeNull();
  });

  it('throws when the target is missing', () => {
    expect(() => findClozeSpan('No fruit here.', 'apple')).toThrow(/not in/);
  });
});

describe('normalizeAnswer / matchInitialCase', () => {
  it('normalizes case, spaces and curly apostrophes', () => {
    expect(normalizeAnswer('  Look   UP ')).toBe('look up');
    expect(normalizeAnswer('o’clock')).toBe("o'clock");
  });

  it('copies an initial capital only', () => {
    expect(matchInitialCase('walked', 'Ran')).toBe('Walked');
    expect(matchInitialCase('walked', 'ran')).toBe('walked');
    expect(matchInitialCase('English', 'ran')).toBe('English');
  });
});
