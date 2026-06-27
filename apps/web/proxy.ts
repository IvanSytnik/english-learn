import NextAuth from 'next-auth';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { authConfig } from './lib/auth.config';

const intl = createIntlMiddleware(routing);

const { auth } = NextAuth(authConfig);

/**
 * Next.js 16: `proxy.ts` replaces `middleware.ts`.
 * Runs first to handle i18n locale, then Auth.js authorization.
 */
export default auth((req) => {
  // Skip auth/intl on api/auth and static assets — matcher already filters most.
  return intl(req);
});

export const config = {
  // Match all paths except API routes, _next internals, and files with extensions.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
