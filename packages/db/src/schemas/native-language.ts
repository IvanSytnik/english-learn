import { z } from 'zod';

/**
 * The learner's native language, as they chose it before the diagnostic.
 *
 * Not the interface locale: the UI language says nothing about the native one,
 * so this is only ever what the learner picked — never derived from the URL,
 * `User.locale` or the browser. `other` means "none of these"; content is shown
 * in English (the source) for it, not in the interface locale.
 *
 * Stored as a plain string in `StudentProfile.nativeLanguage`; writes go
 * through this schema, reads must tolerate anything (see `getNativeLanguage`).
 */
export const NATIVE_LANGUAGES = ['ru', 'uk', 'de', 'other'] as const;

export const NativeLanguageSchema = z.enum(NATIVE_LANGUAGES);

export type NativeLanguage = z.infer<typeof NativeLanguageSchema>;

export function isNativeLanguage(value: unknown): value is NativeLanguage {
  return NativeLanguageSchema.safeParse(value).success;
}
