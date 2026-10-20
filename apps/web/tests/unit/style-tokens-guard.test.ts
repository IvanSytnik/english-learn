import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invariant: UI code uses semantic tokens (packages/ui/src/tokens.css) only.
 * Raw palette classes ignore the dark-mode overrides — that is how white
 * cards with light text ended up on /dashboard once the body went dark.
 *
 * Tailwind scans this file too, so every pattern is assembled from parts:
 * spelling a class out here would generate the very CSS it forbids and mask
 * a regression.
 */

const REPO_ROOT = join(__dirname, '../../../..');
const SCAN_DIRS = [join(REPO_ROOT, 'apps/web/app'), join(REPO_ROOT, 'packages/ui/src')];
// tokens.css defines the palette; it is the one place raw colours belong.
const EXCLUDED = new Set([join(REPO_ROOT, 'packages/ui/src/tokens.css'), __filename]);

const UTILITIES = [
  'bg',
  'text',
  'border',
  'ring',
  'divide',
  'fill',
  'stroke',
  'from',
  'to',
  'via',
  'outline',
  'placeholder',
];
const PALETTES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
];
const ABSOLUTES = [
  ['bg', 'white'],
  ['bg', 'black'],
  ['text', 'white'],
  ['text', 'black'],
];

// Boundaries are anything that cannot be part of a class name, so `hover:`
// variants and `/50` opacity modifiers are still caught.
const RAW_PALETTE = new RegExp(
  `(?<![\\w-])(?:${UTILITIES.join('|')})-(?:${PALETTES.join('|')})-\\d+(?![\\w-])`,
  'g',
);
const RAW_ABSOLUTE = new RegExp(
  `(?<![\\w-])(?:${ABSOLUTES.map((parts) => parts.join('-')).join('|')})(?![\\w-])`,
  'g',
);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(entry.name) && !EXCLUDED.has(full) ? [full] : [];
  });
}

/** Returns human-readable offences for one file (empty array = compliant). */
export function findRawColourOffences(code: string): string[] {
  return code
    .split('\n')
    .flatMap((text, i) =>
      [...text.matchAll(RAW_PALETTE), ...text.matchAll(RAW_ABSOLUTE)].map(
        (match) => `line ${i + 1}: '${match[0]}'`,
      ),
    );
}

describe('style tokens guard: apps/web/app/** and packages/ui/src/**', () => {
  it('finds files to check (guard is not vacuous)', () => {
    for (const dir of SCAN_DIRS) expect(walk(dir).length).toBeGreaterThan(0);
  });

  it('uses no raw Tailwind palette classes', () => {
    const offenders = SCAN_DIRS.flatMap(walk).flatMap((file) =>
      findRawColourOffences(readFileSync(file, 'utf8')).map(
        (offence) => `  ${relative(REPO_ROOT, file)}: ${offence}`,
      ),
    );
    expect(
      offenders,
      `Use semantic tokens (bg-surface, text-ink, border-line, bg-accent, ...) instead:\n${offenders.join('\n')}\n`,
    ).toEqual([]);
  });
});

describe('findRawColourOffences', () => {
  const cls = (...parts: string[]) => parts.join('-');

  it.each([
    [`className="${cls('bg', 'white')} p-4"`, cls('bg', 'white')],
    [`className="${cls('text', 'gray', '500')}"`, cls('text', 'gray', '500')],
    [`'hover:${cls('bg', 'blue', '700')}'`, cls('bg', 'blue', '700')],
    [`"${cls('ring', 'blue', '500')}/50"`, cls('ring', 'blue', '500')],
    [`"${cls('divide', 'slate', '100')}"`, cls('divide', 'slate', '100')],
    [`"placeholder:${cls('text', 'zinc', '400')}"`, cls('text', 'zinc', '400')],
    [`"${cls('border', 'neutral', '200')}"`, cls('border', 'neutral', '200')],
    [`'${cls('bg', 'red', '50')}'`, cls('bg', 'red', '50')],
    [`"${cls('from', 'emerald', '400')}"`, cls('from', 'emerald', '400')],
    [`"${cls('text', 'black')}"`, cls('text', 'black')],
  ])('flags %s', (code, offence) => {
    expect(findRawColourOffences(code)).toEqual([`line 1: '${offence}'`]);
  });

  it.each([
    'className="bg-surface-2 text-ink border-line"',
    'className="text-feedback-incorrect bg-accent/90 text-on-accent"',
    'className="bg-mastery-3 rounded-card shadow-soft"',
    // Not colour utilities, or not Tailwind at all.
    'const gray = "light-gray-ish"; const step = "to-do-100";',
    'className="bg-whitesmoke-ish"',
  ])('accepts %s', (code) => {
    expect(findRawColourOffences(code)).toEqual([]);
  });
});
