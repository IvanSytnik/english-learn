import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The landing tokens (docs/DESIGN.md, B4.1): defined in light and in both dark
 * blocks, the two dark blocks agree, and the pairs the landing uses keep WCAG AA.
 * axe only sees the colours a page happens to render; this pins the palette itself.
 */

const CSS = readFileSync(join(__dirname, '../../../../packages/ui/src/tokens.css'), 'utf8');
const LANDING = ['flag', 'on-flag', 'on-track'] as const;

/** `--color-*` declarations inside the first block that follows `marker`. */
function block(marker: string): Record<string, string> {
  const start = CSS.indexOf(marker);
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const body = CSS.slice(start, CSS.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  );
}

const LIGHT = block('@theme {');
const DARK_OS = block(':root:not([data-theme="light"]) {');
const DARK_EXPLICIT = block(':root[data-theme="dark"] {');

function channel(hex: string, i: number): number {
  const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a = '', b = ''): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('landing tokens', () => {
  it.each(LANDING)('--color-%s is defined in light and in both dark blocks', (name) => {
    expect(LIGHT[name], 'light').toMatch(/^#/);
    expect(DARK_OS[name], 'dark (OS)').toMatch(/^#/);
    expect(DARK_EXPLICIT[name], 'dark (data-theme)').toMatch(/^#/);
  });

  it('the OS dark block and the data-theme dark block are identical', () => {
    expect(DARK_OS).toEqual(DARK_EXPLICIT);
  });

  // [foreground, background, minimum]: text pairs 4.5:1, non-text (marker ring, borders) 3:1.
  const PAIRS = [
    ['flag', 'surface', 4.5],
    ['on-flag', 'flag', 4.5],
    ['on-track', 'surface', 4.5],
    ['on-track', 'surface-2', 4.5],
    ['flag', 'surface-2', 3],
  ] as const;

  it.each([
    ['light', LIGHT],
    ['dark', DARK_OS],
  ] as const)('%s: landing pairs meet WCAG AA', (_, palette) => {
    for (const [fg, bg, min] of PAIRS) {
      expect(contrast(palette[fg], palette[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });
});
