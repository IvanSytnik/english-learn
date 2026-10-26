import { describe, expect, it } from 'vitest';

import { isNativeLanguage, NATIVE_LANGUAGES, NativeLanguageSchema } from '../native-language';

describe('NativeLanguageSchema', () => {
  it('accepts the four choices, in the order the picker shows them', () => {
    expect(NATIVE_LANGUAGES).toEqual(['ru', 'uk', 'de', 'other']);
    for (const language of NATIVE_LANGUAGES) {
      expect(NativeLanguageSchema.parse(language)).toBe(language);
    }
  });

  it('rejects anything else, including interface locales that are not a choice', () => {
    for (const value of ['en', 'RU', 'ru ', 'pl', '', null, undefined, 42, {}]) {
      expect(NativeLanguageSchema.safeParse(value).success, String(value)).toBe(false);
      expect(isNativeLanguage(value), String(value)).toBe(false);
    }
  });
});
