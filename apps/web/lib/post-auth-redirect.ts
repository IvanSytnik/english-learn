import { defaultLocale, locales } from '../i18n/config';
import { hasLocalePrefix, splitLocale } from './access';
import { isSafeCallbackPath } from './safe-redirect';

/** Where to send a user after sign-in/sign-up: a locale plus an unprefixed href. */
export type PostAuthTarget = { locale: string; href: string };

/**
 * Pure. The URL locale is the source of truth:
 * - unsafe or missing callback → `/dashboard` in the current locale
 * - safe callback with a locale prefix (`/de/exercises`) → kept as is
 * - safe callback without a prefix (`/exercises`) → current locale, so an
 *   unprefixed (= en) URL is never used for a non-en user
 */
export function resolvePostAuthRedirect(
  callbackUrl: unknown,
  currentLocale: string,
): PostAuthTarget {
  const fallbackLocale = (locales as readonly string[]).includes(currentLocale)
    ? currentLocale
    : defaultLocale;
  if (!isSafeCallbackPath(callbackUrl)) return { locale: fallbackLocale, href: '/dashboard' };

  const cut = callbackUrl.search(/[?#]/);
  const pathname = cut === -1 ? callbackUrl : callbackUrl.slice(0, cut);
  const suffix = cut === -1 ? '' : callbackUrl.slice(cut);
  const { locale, path } = splitLocale(pathname);

  return {
    locale: hasLocalePrefix(pathname) ? locale : fallbackLocale,
    href: `${path}${suffix}`,
  };
}
