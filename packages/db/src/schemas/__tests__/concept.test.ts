import { describe, expect, it } from 'vitest';

import { getConceptTitle } from '../concept';

const name = 'Past Simple';

describe('getConceptTitle', () => {
  it('returns the requested locale when present', () => {
    const concept = { name, title: { en: 'Past Simple', ru: 'Past Simple (прошедшее)' } };
    expect(getConceptTitle(concept, 'ru')).toBe('Past Simple (прошедшее)');
  });

  it('falls back to title.en when the locale is missing', () => {
    expect(getConceptTitle({ name, title: { en: 'Past tense' } }, 'uk')).toBe('Past tense');
  });

  it('falls back to name when title is null', () => {
    expect(getConceptTitle({ name, title: null }, 'de')).toBe(name);
  });

  it('falls back to name when title is malformed instead of throwing', () => {
    expect(getConceptTitle({ name, title: { ru: 'нет en' } }, 'ru')).toBe(name);
    expect(getConceptTitle({ name, title: 'Past Simple' }, 'en')).toBe(name);
    expect(getConceptTitle({ name, title: { en: 'x', fr: 'y' } }, 'en')).toBe(name);
  });
});
