import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  rememberSignupRef,
  SIGNUP_REF_COOKIE,
  sanitizeSignupSource,
} from '@/lib/auth/signup-source';

describe('sanitizeSignupSource', () => {
  it.each(['reddit', 'beta-invite', 'tg-2026', 'a', '0', 'x'.repeat(32)])('keeps %s', (slug) => {
    expect(sanitizeSignupSource(slug)).toBe(slug);
  });

  it('folds uppercase to the lowercase slug', () => {
    expect(sanitizeSignupSource('Reddit')).toBe('reddit');
    expect(sanitizeSignupSource('BETA-Invite')).toBe('beta-invite');
  });

  it.each([
    'beta_invite',
    'beta invite',
    ' reddit',
    'reddit\n',
    'a.b',
    'a/b',
    '<script>',
    "x';drop",
    'reddit%20',
    'ünï',
  ])('rejects %j', (raw) => {
    expect(sanitizeSignupSource(raw)).toBeNull();
  });

  it('rejects an empty ref and one longer than 32 characters', () => {
    expect(sanitizeSignupSource('')).toBeNull();
    expect(sanitizeSignupSource('x'.repeat(33))).toBeNull();
    expect(sanitizeSignupSource('x'.repeat(10_000))).toBeNull();
  });

  it.each([null, undefined, 42, ['reddit'], { ref: 'reddit' }])('rejects non-string %j', (raw) => {
    expect(sanitizeSignupSource(raw)).toBeNull();
  });
});

describe('rememberSignupRef', () => {
  function apply(search: string): NextResponse {
    const res = NextResponse.next();
    rememberSignupRef(new URLSearchParams(search), res);
    return res;
  }

  it('sets a 30-day lax HttpOnly cookie for a valid ref', () => {
    const header = apply('?ref=Reddit').headers.get('set-cookie') ?? '';

    expect(header).toContain(`${SIGNUP_REF_COOKIE}=reddit`);
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=2592000');
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toContain('HttpOnly');
  });

  it.each([
    '',
    '?ref=',
    '?ref=bad_ref',
    `?ref=${'x'.repeat(33)}`,
    '?other=reddit',
  ])('sets nothing for %j', (search) => {
    expect(apply(search).headers.get('set-cookie')).toBeNull();
  });
});
