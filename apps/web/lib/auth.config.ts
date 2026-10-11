import type { NextAuthConfig } from 'next-auth';
import { routing } from '../i18n/routing';

// `localePrefix: 'as-needed'` means paths may or may not start with a locale.
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);

/** `/ru/admin/users` → `/admin/users`, `/ru` → `/`. */
export function stripLocale(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX, '') || '/';
}

/**
 * Edge-safe Auth.js config (used in proxy.ts).
 * No database adapter here — that goes in lib/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = stripLocale(nextUrl.pathname);

      const isPublic =
        path === '/' ||
        path === '/login' ||
        path.startsWith('/login/') ||
        path === '/register' ||
        path.startsWith('/register/') ||
        path.startsWith('/api/auth');

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      // Admin routes require ADMIN role.
      if (path === '/admin' || path.startsWith('/admin/')) {
        return auth.user.role === 'ADMIN';
      }
      // Tutor routes require TUTOR or ADMIN.
      if (path === '/tutor' || path.startsWith('/tutor/')) {
        return auth.user.role === 'TUTOR' || auth.user.role === 'ADMIN';
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'STUDENT' | 'TUTOR' | 'ADMIN';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
