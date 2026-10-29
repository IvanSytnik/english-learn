import { defaultLocale, locales } from '../i18n/config';

/**
 * Proxy access decision. Pure (no Next.js imports) so it is unit-testable.
 *
 * The proxy only answers "does this request need a session?". Role checks
 * live in pages/layouts (requireRole) and server actions (authorizeAction);
 * /admin/* is deliberately left alone so that guests get the same 404 as
 * students and the area's existence is not revealed.
 */

export type AccessSession = { user?: unknown } | null | undefined;
export type AccessDecision = 'allow' | { redirect: string };

// `localePrefix: 'as-needed'` means paths may or may not start with a locale.
const LOCALE_PREFIX = new RegExp(`^/(${locales.join('|')})(?=/|$)`);

const SESSION_REQUIRED = [
  '/dashboard',
  '/diagnostic',
  '/exercises',
  '/settings',
  '/tutor',
  '/words',
];
const GUEST_ONLY = ['/login', '/register', '/forgot-password', '/reset-password'];

function inSection(path: string, sections: string[]): boolean {
  return sections.some((section) => path === section || path.startsWith(`${section}/`));
}

/** `/ru//admin///users` → `/ru/admin/users`. The proxy redirects to this before any access check. */
export function collapseSlashes(pathname: string): string {
  return pathname.replace(/\/{2,}/g, '/');
}

/** True when `pathname` starts with a locale segment (`/ru`, `/en/...`). */
export function hasLocalePrefix(pathname: string): boolean {
  return LOCALE_PREFIX.test(pathname);
}

/** `/ru/admin/users` → `{ locale: 'ru', path: '/admin/users' }`; unprefixed → default locale. */
export function splitLocale(pathname: string): { locale: string; path: string } {
  const match = LOCALE_PREFIX.exec(pathname);
  if (!match) return { locale: defaultLocale, path: pathname || '/' };
  return { locale: match[1] ?? defaultLocale, path: pathname.slice(match[0].length) || '/' };
}

/** Prefix for links in `locale` (the default locale is unprefixed). */
function localePrefix(locale: string): string {
  return locale === defaultLocale ? '' : `/${locale}`;
}

/**
 * @param pathname request pathname as received (may carry a locale prefix)
 * @param session  Auth.js session, or null for guests
 * @param search   request query string including the leading `?` (or '')
 */
export function resolveAccess(
  pathname: string,
  session: AccessSession,
  search = '',
): AccessDecision {
  const { locale, path } = splitLocale(pathname);
  const isLoggedIn = !!session?.user;
  const prefix = localePrefix(locale);

  if (isLoggedIn && inSection(path, GUEST_ONLY)) {
    return { redirect: `${prefix}/dashboard` };
  }
  if (!isLoggedIn && inSection(path, SESSION_REQUIRED)) {
    const callbackUrl = encodeURIComponent(`${pathname}${search}`);
    return { redirect: `${prefix}/login?callbackUrl=${callbackUrl}` };
  }
  return 'allow';
}
