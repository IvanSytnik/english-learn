import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { collapseSlashes, resolveAccess } from './lib/access';
import { authConfig } from './lib/auth.config';

const intl = createIntlMiddleware(routing);

const { auth } = NextAuth(authConfig);

/**
 * Next.js 16: `proxy.ts` replaces `middleware.ts`.
 * Session gate first (guests → localized login, signed-in users off
 * /login and /register), then next-intl for everything that is allowed.
 * Role checks are not done here — see lib/authz.ts.
 */
export default auth((req) => {
  // `/ru//admin` must not slip past prefix checks; resolveAccess only sees collapsed paths.
  // (Next's router already 308s these today; this keeps the invariant if that changes.)
  const collapsed = collapseSlashes(req.nextUrl.pathname);
  if (collapsed !== req.nextUrl.pathname) {
    const url = req.nextUrl.clone();
    url.pathname = collapsed;
    return NextResponse.redirect(url, 308);
  }

  const decision = resolveAccess(req.nextUrl.pathname, req.auth, req.nextUrl.search);
  if (decision !== 'allow') {
    return NextResponse.redirect(new URL(decision.redirect, req.nextUrl), 307);
  }
  return intl(req);
});

export const config = {
  // Everything except API routes, Next internals and real static assets.
  // Only known asset extensions are skipped: a dot elsewhere in a path
  // (e.g. /admin/users/jane.doe) must still go through the proxy.
  matcher: [
    '/((?!api|_next|_vercel|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|map|txt|xml|webmanifest|woff|woff2)$).*)',
  ],
};
