import { describe, expect, it } from 'vitest';
import { isSafeCallbackPath } from '@/lib/safe-redirect';

describe('isSafeCallbackPath', () => {
  it.each([
    '/',
    '/dashboard',
    '/ru/dashboard',
    '/ru/exercises?topic=past&n=2',
    '/dashboard#progress',
    '/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82', // percent-encoded Cyrillic
    '/a/../dashboard',
    '/javascript:alert(1)', // a path segment, not a scheme
  ])('accepts %s', (value) => {
    expect(isSafeCallbackPath(value)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['relative path', 'dashboard'],
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/ru/dashboard'],
    ['triple slash', '///evil.com'],
    ['backslash after slash', '/\\evil.com'],
    ['backslash pair', '\\\\evil.com'],
    ['backslash later in path', '/foo\\..\\\\evil.com'],
    ['absolute http URL', 'https://evil.com'],
    ['absolute same-looking URL', 'http://localhost/dashboard'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['encoded double slash', '/%2F%2Fevil.com'],
    ['encoded double slash, lower case', '/%2f%2fevil.com'],
    ['fully encoded double slash', '%2F%2Fevil.com'],
    ['double-encoded double slash', '/%252F%252Fevil.com'],
    ['encoded backslash', '/%5Cevil.com'],
    ['encoded backslash, lower case', '/%5cevil.com'],
    ['tab between slashes', '/\t/evil.com'],
    ['newline between slashes', '/\n/evil.com'],
    ['encoded tab between slashes', '/%09/evil.com'],
    ['NUL byte', '/dashboard\u0000'],
    ['malformed escape', '/%E0%A4%A'],
    ['too long', `/${'a'.repeat(2048)}`],
  ])('rejects %s', (_label, value) => {
    expect(isSafeCallbackPath(value)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['array', ['/dashboard']],
  ])('rejects non-string %s', (_label, value) => {
    expect(isSafeCallbackPath(value)).toBe(false);
  });
});
