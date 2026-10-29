import { describe, expect, it } from 'vitest';
import { type AccessSession, collapseSlashes, resolveAccess, splitLocale } from '@/lib/access';

type Who = 'guest' | 'STUDENT' | 'TUTOR' | 'ADMIN';

const sessionFor = (who: Who): AccessSession =>
  who === 'guest' ? null : { user: { id: '1', role: who } };

const SIGNED_IN: Who[] = ['STUDENT', 'TUTOR', 'ADMIN'];
const EVERYONE: Who[] = ['guest', ...SIGNED_IN];

// [locale label, prefix as it appears in the URL]
const LOCALES = [
  ['en (unprefixed)', ''],
  ['ru (prefixed)', '/ru'],
] as const;

describe('resolveAccess', () => {
  describe.each(LOCALES)('%s', (_label, prefix) => {
    const login = (path: string) =>
      `${prefix}/login?callbackUrl=${encodeURIComponent(`${prefix}${path}`)}`;

    describe('session-required zones (student area, tutor)', () => {
      const paths = [
        '/dashboard',
        '/diagnostic',
        '/exercises',
        '/exercises/42',
        '/settings',
        '/tutor',
        '/tutor/x',
      ];

      it.each(paths)('guest on %s → localized login with callbackUrl', (path) => {
        expect(resolveAccess(`${prefix}${path}`, null)).toEqual({ redirect: login(path) });
      });

      // Role checks are not the proxy's job: a student on /tutor is let through to 404 in the page.
      it.each(
        SIGNED_IN.flatMap((who) => paths.map((path) => [who, path] as const)),
      )('%s on %s → allow', (who, path) => {
        expect(resolveAccess(`${prefix}${path}`, sessionFor(who))).toBe('allow');
      });
    });

    describe('admin zone: proxy does nothing (pages 404 via requireRole)', () => {
      it.each(
        EVERYONE.flatMap((who) => ['/admin', '/admin/users'].map((p) => [who, p] as const)),
      )('%s on %s → allow', (who, path) => {
        expect(resolveAccess(`${prefix}${path}`, sessionFor(who))).toBe('allow');
      });
    });

    describe('guest-only pages', () => {
      const guestOnly = ['/login', '/register', '/forgot-password', '/reset-password'];

      it.each(guestOnly)('guest on %s → allow', (path) => {
        expect(resolveAccess(`${prefix}${path}`, null)).toBe('allow');
      });

      it.each(
        SIGNED_IN.flatMap((who) => guestOnly.map((p) => [who, p] as const)),
      )('%s on %s → localized dashboard', (who, path) => {
        expect(resolveAccess(`${prefix}${path}`, sessionFor(who))).toEqual({
          redirect: `${prefix}/dashboard`,
        });
      });
    });

    describe('public pages', () => {
      it.each(EVERYONE)('%s on the landing page → allow', (who) => {
        expect(resolveAccess(prefix || '/', sessionFor(who))).toBe('allow');
      });

      // The footer links here from every page, signed in or not.
      it.each(
        EVERYONE.flatMap((who) => ['/impressum', '/datenschutz', '/credits'].map((p) => [who, p])),
      )('%s on %s → allow', (who, path) => {
        expect(resolveAccess(`${prefix}${path}`, sessionFor(who as Who))).toBe('allow');
      });
    });
  });

  it('keeps the query string in callbackUrl', () => {
    expect(resolveAccess('/ru/exercises', null, '?topic=past&n=2')).toEqual({
      redirect: `/ru/login?callbackUrl=${encodeURIComponent('/ru/exercises?topic=past&n=2')}`,
    });
  });

  it('treats an explicit default-locale prefix as unprefixed for the redirect', () => {
    expect(resolveAccess('/en/dashboard', null)).toEqual({
      redirect: '/login?callbackUrl=%2Fen%2Fdashboard',
    });
  });

  it('does not treat look-alike prefixes as protected or guest-only', () => {
    expect(resolveAccess('/dashboards', null)).toBe('allow');
    expect(resolveAccess('/tutoring', null)).toBe('allow');
    expect(resolveAccess('/login-history', sessionFor('STUDENT'))).toBe('allow');
    expect(resolveAccess('/russia/dashboard', null)).toBe('allow');
  });

  it('allows API and health paths (also excluded by the matcher)', () => {
    expect(resolveAccess('/api/health', null)).toBe('allow');
  });
});

describe('splitLocale', () => {
  it.each([
    ['/ru/admin/users', 'ru', '/admin/users'],
    ['/de', 'de', '/'],
    ['/admin', 'en', '/admin'],
    ['/russia', 'en', '/russia'],
    ['/', 'en', '/'],
  ])('%s → %s + %s', (pathname, locale, path) => {
    expect(splitLocale(pathname)).toEqual({ locale, path });
  });
});

describe('collapseSlashes', () => {
  it.each([
    ['/', '/'],
    ['//', '/'],
    ['/ru//admin/users', '/ru/admin/users'],
    ['//ru/dashboard', '/ru/dashboard'],
    ['/ru///dashboard//x', '/ru/dashboard/x'],
    ['/ru/dashboard/', '/ru/dashboard/'],
    ['/ru/admin/users', '/ru/admin/users'],
    ['/admin/users/jane.doe', '/admin/users/jane.doe'],
  ])('%s → %s', (input, expected) => {
    expect(collapseSlashes(input)).toBe(expected);
  });

  // Why the proxy collapses first: raw `//` hides the section from the prefix checks.
  it('a raw /ru//dashboard escapes the session gate; the collapsed path does not', () => {
    expect(resolveAccess('/ru//dashboard', null)).toBe('allow');
    expect(resolveAccess(collapseSlashes('/ru//dashboard'), null)).toEqual({
      redirect: '/ru/login?callbackUrl=%2Fru%2Fdashboard',
    });
  });
});
