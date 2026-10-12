import { describe, expect, it } from 'vitest';
import { resolvePostAuthRedirect } from '@/lib/post-auth-redirect';

describe('resolvePostAuthRedirect', () => {
  describe.each(['en', 'ru'])('current locale %s', (current) => {
    it.each([
      ['missing (null)', null],
      ['missing (undefined)', undefined],
      ['empty', ''],
      ['protocol-relative', '//evil.com'],
      ['encoded protocol-relative', '/%2F%2Fevil.com'],
      ['backslash', '/\\evil.com'],
      ['absolute URL', 'https://evil.com/ru/dashboard'],
      ['javascript scheme', 'javascript:alert(1)'],
      ['non-string (File-like)', { name: 'x' }],
    ])('%s → /dashboard in the current locale', (_label, callbackUrl) => {
      expect(resolvePostAuthRedirect(callbackUrl, current)).toEqual({
        locale: current,
        href: '/dashboard',
      });
    });

    it.each([
      ['/dashboard', '/dashboard'],
      ['/exercises', '/exercises'],
      ['/exercises?topic=past&n=2', '/exercises?topic=past&n=2'],
      ['/', '/'],
    ])('unprefixed %s → current locale + %s', (callbackUrl, href) => {
      expect(resolvePostAuthRedirect(callbackUrl, current)).toEqual({ locale: current, href });
    });

    it.each([
      ['/ru/exercises', 'ru', '/exercises'],
      ['/de/dashboard', 'de', '/dashboard'],
      ['/en/dashboard', 'en', '/dashboard'],
      ['/ru', 'ru', '/'],
      ['/uk/exercises?topic=past', 'uk', '/exercises?topic=past'],
    ])('prefixed %s → its own locale %s + %s', (callbackUrl, locale, href) => {
      expect(resolvePostAuthRedirect(callbackUrl, current)).toEqual({ locale, href });
    });
  });

  it('falls back to the default locale for an unknown current locale', () => {
    expect(resolvePostAuthRedirect(null, 'xx')).toEqual({ locale: 'en', href: '/dashboard' });
  });

  it('does not treat a look-alike segment as a locale prefix', () => {
    expect(resolvePostAuthRedirect('/russia', 'de')).toEqual({ locale: 'de', href: '/russia' });
  });
});
