import { describe, expect, it } from 'vitest';
import { authConfig, stripLocale } from '@/lib/auth.config';

describe('authConfig.authorized', () => {
  const make = (
    auth: { user: { id: string; role: 'STUDENT' | 'TUTOR' | 'ADMIN' } } | null,
    pathname: string,
  ) =>
    authConfig.callbacks?.authorized?.({
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      auth: auth as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      request: { nextUrl: new URL(`http://localhost${pathname}`) } as any,
    });

  it('allows guests on the landing page', () => {
    expect(make(null, '/')).toBe(true);
  });

  it('allows guests on /login', () => {
    expect(make(null, '/login')).toBe(true);
  });

  it('blocks guests from /dashboard', () => {
    expect(make(null, '/dashboard')).toBe(false);
  });

  it('blocks students from /admin', () => {
    expect(make({ user: { id: '1', role: 'STUDENT' } }, '/admin/content/vocab')).toBe(false);
  });

  it('allows admins on /admin', () => {
    expect(make({ user: { id: '1', role: 'ADMIN' } }, '/admin/content/vocab')).toBe(true);
  });

  it('allows guests on localized public pages', () => {
    expect(make(null, '/ru')).toBe(true);
    expect(make(null, '/ru/login')).toBe(true);
    expect(make(null, '/de/register')).toBe(true);
  });

  it('blocks guests from localized protected pages', () => {
    expect(make(null, '/uk/dashboard')).toBe(false);
  });

  it('blocks students from localized /admin', () => {
    expect(make({ user: { id: '1', role: 'STUDENT' } }, '/ru/admin/users')).toBe(false);
  });

  it('allows admins on localized /admin', () => {
    expect(make({ user: { id: '1', role: 'ADMIN' } }, '/ru/admin/users')).toBe(true);
  });

  it('does not treat look-alike prefixes as public or admin', () => {
    expect(make(null, '/login-history')).toBe(false);
    expect(make({ user: { id: '1', role: 'STUDENT' } }, '/administrator')).toBe(true);
  });
});

describe('stripLocale', () => {
  it('strips a known locale prefix', () => {
    expect(stripLocale('/ru/admin/users')).toBe('/admin/users');
    expect(stripLocale('/de')).toBe('/');
  });

  it('leaves unprefixed and look-alike paths alone', () => {
    expect(stripLocale('/admin')).toBe('/admin');
    expect(stripLocale('/russia')).toBe('/russia');
  });
});
