import { z } from 'zod';

/**
 * Supported interface locales.
 *
 * Aligned with `next-intl` configuration in `apps/web/i18n/routing.ts`.
 * `en` is the source-of-truth language: AI-generated content originates in EN,
 * other locales are translations.
 *
 * To add a locale:
 *   1. Add the code here.
 *   2. Add the messages file in `apps/web/messages/<code>.json`.
 *   3. Update `next-intl` routing config.
 *   4. Backfill existing exercises (translation job).
 */
export const SUPPORTED_LOCALES = ['en', 'ru', 'uk', 'de'] as const;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);

export type Locale = z.infer<typeof LocaleSchema>;

/** Source-of-truth locale. Required in every localized field. */
export const SOURCE_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return LocaleSchema.safeParse(value).success;
}
