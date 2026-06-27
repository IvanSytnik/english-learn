import { describe, expect, it } from 'vitest';
import { authConfig } from '@/lib/auth.config';

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
});
