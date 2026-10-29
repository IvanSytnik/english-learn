import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { collapseSlashes, resolveAccess } from './lib/access';
import { jwtWithRevocation } from './lib/auth/session-revocation';
import { rememberSignupRef } from './lib/auth/signup-source';
import { authConfig } from './lib/auth.config';

const intl = createIntlMiddleware(routing);

// Same revocation check as lib/auth.ts: a session from before a password
// change is cleared here, so the gate below treats it as a guest.
const { auth } = NextAuth({
  ...authConfig,
  callbacks: { ...authConfig.callbacks, jwt: jwtWithRevocation },
});

/**
 * Next.js 16: `proxy.ts` replaces `middleware.ts`.
 * Session gate first (guests → localized login, signed-in users off
 * /login and /register), then next-intl for everything that is allowed.
 * Role checks are not done here — see lib/authz.ts.
 * A valid `?ref=` is remembered on whatever response goes out, redirects included.
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
  const res =
    decision === 'allow'
      ? intl(req)
      : NextResponse.redirect(new URL(decision.redirect, req.nextUrl), 307);
  rememberSignupRef(req.nextUrl.searchParams, res);
  return res;
});

export const config = {
  // Everything except API routes, Next internals, the Sentry tunnel
  // (next.config.ts `tunnelRoute`) and real static assets.
  // Only known asset extensions are skipped: a dot elsewhere in a path
  // (e.g. /admin/users/jane.doe) must still go through the proxy.
  matcher: [
    '/((?!api|_next|_vercel|monitoring|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|map|txt|xml|webmanifest|woff|woff2)$).*)',
  ],
};
