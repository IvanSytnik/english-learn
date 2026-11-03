import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Axiom 5 for the vocabulary engine: every choice (distractors, option order)
 * comes from the injected seedable Rng, so the grader can rebuild a card.
 * Math.random would make a served card ungradable — no source file in
 * vocab/ may call it.
 */
const DIR = new URL('..', import.meta.url);

describe('vocab/ determinism', () => {
  it('no source file calls Math.random', () => {
    // vocab/ and its variant modules (B6.3), never the tests.
    const files = readdirSync(DIR, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.ts') && !f.includes('__tests__'),
    );
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.startsWith('variants'))).toBe(true);
    for (const file of files) {
      expect(readFileSync(new URL(file, DIR), 'utf8'), file).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});
