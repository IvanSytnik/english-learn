import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * V2-15 across the whole app: a client component that calls a server action
 * itself goes through `callServerAction`, so a page from an older build
 * reloads once instead of showing a dead error. Read from the sources, so a
 * new form cannot forget it.
 *
 * Not covered here on purpose: an action passed straight to `useActionState`
 * (login, register) rejects into the `[locale]` error boundary, which calls
 * `reloadOnceForSkew` — and keeps the form's progressive enhancement.
 */

const APP = join(__dirname, '..', '..', 'app');
const VIA_ERROR_BOUNDARY = new Set([
  'app/[locale]/(auth)/login/login-form.tsx',
  'app/[locale]/(auth)/register/register-form.tsx',
]);

/** A value import (not `import type`) from a server actions module. */
const ACTION_IMPORT = /^import (?!type\b)[^;]*?from '[^']*\/actions(?:\/[^']*)?';/ms;

function clientSources(dir: string): { file: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return clientSources(path);
    if (!entry.name.endsWith('.tsx')) return [];
    const source = readFileSync(path, 'utf8');
    return source.startsWith("'use client'")
      ? [{ file: relative(join(APP, '..'), path), source }]
      : [];
  });
}

describe('server actions called from client components (V2-15)', () => {
  const callers = clientSources(APP).filter(({ source }) => ACTION_IMPORT.test(source));

  it('finds the callers at all', () => {
    expect(callers.length).toBeGreaterThanOrEqual(20);
    expect(callers.map((c) => c.file)).toEqual(expect.arrayContaining([...VIA_ERROR_BOUNDARY]));
  });

  it('each one calls through callServerAction, or is a useActionState form', () => {
    const bare = callers
      .filter(({ file }) => !VIA_ERROR_BOUNDARY.has(file))
      .filter(({ source }) => !source.includes("from '@/lib/action-skew'"))
      .map(({ file }) => file);
    expect(bare).toEqual([]);
  });

  it('the useActionState forms hand the action to the hook, never call it', () => {
    for (const { file, source } of callers.filter((c) => VIA_ERROR_BOUNDARY.has(c.file))) {
      expect(source, file).toMatch(/useActionState[^(]*\(/);
    }
  });
});
