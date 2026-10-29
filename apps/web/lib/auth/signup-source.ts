import type { NextResponse } from 'next/server';

/** Holds a `?ref=` slug from the first visit until sign-up (proxy.ts sets it, registerUser reads it). */
export const SIGNUP_REF_COOKIE = 'signup_ref';

const SIGNUP_REF_MAX_AGE = 30 * 24 * 60 * 60;
const SLUG = /^[a-z0-9-]{1,32}$/;

/**
 * The `User.signupSource` value for a raw ref, or `null` when it is not a slug.
 * Case is folded (`?ref=Reddit` → `reddit`); anything else outside `[a-z0-9-]{1,32}` is dropped,
 * never repaired — the value comes from a URL or a cookie the client controls.
 */
export function sanitizeSignupSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

/** Stores a valid `?ref=` on the response (last touch wins); an invalid one changes nothing. */
export function rememberSignupRef(searchParams: URLSearchParams, res: NextResponse): void {
  const source = sanitizeSignupSource(searchParams.get('ref'));
  if (!source) return;
  res.cookies.set(SIGNUP_REF_COOKIE, source, {
    path: '/',
    maxAge: SIGNUP_REF_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
  });
}
