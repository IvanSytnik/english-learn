import type { NativeLanguage } from '@englishlearn/db/schemas';

/**
 * The native-language choices, in a fixed order. Endonyms are constants, not
 * `Intl.DisplayNames` (its casing differs between Node and browsers — a
 * hydration mismatch); "Other" (`endonym: null`) is a message in the interface
 * language.
 */
export const LANGUAGE_CHOICES: readonly { code: NativeLanguage; endonym: string | null }[] = [
  { code: 'ru', endonym: 'Русский' },
  { code: 'uk', endonym: 'Українська' },
  { code: 'de', endonym: 'Deutsch' },
  { code: 'other', endonym: null },
];
