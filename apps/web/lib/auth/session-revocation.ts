import 'server-only';
import { prisma } from '@englishlearn/db';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { authConfig } from '../auth.config';

type JwtCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['jwt']>;

/**
 * True when a token issued at `iat` (JWT seconds) predates the last password
 * change. Auth.js re-signs the token — new `iat` — on every session read, but
 * only after this check has passed, so a session from before the change can
 * never be refreshed past it. Compared in whole seconds: a sign-in in the same
 * second as the reset must survive it.
 */
export function issuedBeforePasswordChange(
  iat: number | undefined,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt) return false;
  if (typeof iat !== 'number') return true;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

/** The token, or null (Auth.js then clears the cookie) when its user changed password or is gone. */
export async function revokeIfStale(token: JWT): Promise<JWT | null> {
  if (!token.id) return token;
  try {
    const user = await prisma.user.findUnique({
      where: { id: token.id },
      select: { passwordChangedAt: true },
    });
    if (!user) return null;
    return issuedBeforePasswordChange(token.iat, user.passwordChangedAt) ? null : token;
  } catch (err) {
    // Fail open: a throwing jwt callback clears the cookie, and a DB blip must
    // not sign every user out.
    console.error('session revocation check failed', err);
    return token;
  }
}

/**
 * authConfig's jwt callback plus the revocation check. Used by both lib/auth.ts
 * and proxy.ts: if only pages revoked, the proxy would still see a session and
 * bounce /login → /dashboard → /login.
 */
export const jwtWithRevocation: JwtCallback = async (params) => {
  const token = await authConfig.callbacks.jwt(params);
  // A fresh sign-in has just proven the current password.
  if (params.user) return token;
  return revokeIfStale(token);
};
