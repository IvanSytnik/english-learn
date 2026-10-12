import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config (used in proxy.ts).
 * No database adapter here — that goes in lib/auth.ts.
 * No `authorized` callback: when proxy.ts passes a handler to `auth()`, Auth.js
 * ignores a `false` result, so the session gate lives in lib/access.ts instead.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
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
