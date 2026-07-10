import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isLocale, LocaleSchema, SOURCE_LOCALE, SUPPORTED_LOCALES } from '../locale';
import { fromSource, LocalizedStringSchema, localized, presentLocales } from '../localized-string';

describe('LocaleSchema', () => {
  it('accepts every supported locale', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(LocaleSchema.parse(loc)).toBe(loc);
    }
  });

  it('rejects unknown locales', () => {
    expect(LocaleSchema.safeParse('fr').success).toBe(false);
    expect(LocaleSchema.safeParse('EN').success).toBe(false);
    expect(LocaleSchema.safeParse('').success).toBe(false);
  });

  it('isLocale type guard', () => {
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('klingon')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('LocalizedStringSchema', () => {
  it('requires English source', () => {
    expect(LocalizedStringSchema.safeParse({ ru: 'Привет' }).success).toBe(false);
    expect(LocalizedStringSchema.safeParse({ en: 'Hello' }).success).toBe(true);
  });

  it('rejects empty/whitespace English', () => {
    expect(LocalizedStringSchema.safeParse({ en: '' }).success).toBe(false);
    expect(LocalizedStringSchema.safeParse({ en: '   ' }).success).toBe(false);
  });

  it('accepts EN + any subset of other locales', () => {
    expect(
      LocalizedStringSchema.safeParse({
        en: 'Hello',
        ru: 'Привет',
        uk: 'Привіт',
        de: 'Hallo',
      }).success,
    ).toBe(true);
    expect(LocalizedStringSchema.safeParse({ en: 'Hello', de: 'Hallo' }).success).toBe(true);
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(LocalizedStringSchema.safeParse({ en: 'Hello', fr: 'Bonjour' }).success).toBe(false);
  });

  it('rejects empty non-source locales', () => {
    expect(LocalizedStringSchema.safeParse({ en: 'Hello', ru: '' }).success).toBe(false);
  });

  it('trims whitespace on parse', () => {
    const parsed = LocalizedStringSchema.parse({ en: '  Hello  ' });
    expect(parsed.en).toBe('Hello');
  });
});

describe('localized()', () => {
  it('returns the requested locale when present', () => {
    const field = fromSource('Hello', { ru: 'Привет', de: 'Hallo' });
    expect(localized(field, 'ru')).toBe('Привет');
    expect(localized(field, 'de')).toBe('Hallo');
  });

  it('falls back to English when locale missing', () => {
    const field = fromSource('Hello', { ru: 'Привет' });
    expect(localized(field, 'uk')).toBe('Hello');
    expect(localized(field, 'de')).toBe('Hello');
  });

  it('returns empty string on null/undefined input', () => {
    expect(localized(null, 'en')).toBe('');
    expect(localized(undefined, 'ru')).toBe('');
  });

  it('property: result is always non-null string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_LOCALES),
        fc.string({ minLength: 1, maxLength: 50 }),
        (locale, en) => {
          const trimmed = en.trim();
          if (!trimmed) return; // skip — would fail validation upstream
          const field = fromSource(trimmed);
          const result = localized(field, locale);
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('presentLocales()', () => {
  it('always includes source locale', () => {
    expect(presentLocales(fromSource('Hello'))).toEqual([SOURCE_LOCALE]);
  });

  it('includes only locales with non-empty values', () => {
    const field = fromSource('Hello', { ru: 'Привет', de: 'Hallo' });
    expect(presentLocales(field).sort()).toEqual(['de', 'en', 'ru']);
  });
});
