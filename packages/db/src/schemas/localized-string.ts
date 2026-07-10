import { z } from 'zod';
import { type Locale, SOURCE_LOCALE } from './locale';

/**
 * A string available in one or more interface locales.
 *
 * Invariants:
 *   - `en` (SOURCE_LOCALE) is always required and non-empty.
 *   - Other locales are optional. Missing locale ⇒ fall back to `en`.
 *   - Empty/whitespace-only strings for non-source locales are treated as missing.
 *
 * Wire format (stored in Postgres jsonb):
 *   { "en": "Match the word to its definition", "ru": "Сопоставьте слово с определением" }
 */
export const LocalizedStringSchema = z
  .object({
    en: z.string().trim().min(1, 'English (source) text is required'),
    ru: z.string().trim().min(1).optional(),
    uk: z.string().trim().min(1).optional(),
    de: z.string().trim().min(1).optional(),
  })
  .strict();

export type LocalizedString = z.infer<typeof LocalizedStringSchema>;

/**
 * Resolve a LocalizedString to a single string for the given locale.
 * Falls back to SOURCE_LOCALE (`en`) if the requested locale is missing.
 *
 * Never throws. Returns empty string only if the input is malformed (would have
 * failed Zod validation upstream — defensive default).
 */
export function localized(field: LocalizedString | null | undefined, locale: Locale): string {
  if (!field) return '';
  const requested = field[locale];
  if (typeof requested === 'string' && requested.length > 0) {
    return requested;
  }
  return field[SOURCE_LOCALE] ?? '';
}

/**
 * Locales actually present in a LocalizedString (excluding source).
 * Useful for admin UI: "show me exercises missing a UK translation".
 */
export function presentLocales(field: LocalizedString): Locale[] {
  const out: Locale[] = [SOURCE_LOCALE];
  for (const loc of ['ru', 'uk', 'de'] as const) {
    if (field[loc]) out.push(loc);
  }
  return out;
}

/**
 * Build a LocalizedString from an English source. Convenience for seeds/tests.
 */
export function fromSource(en: string, extra?: Partial<LocalizedString>): LocalizedString {
  return LocalizedStringSchema.parse({ en, ...extra });
}
