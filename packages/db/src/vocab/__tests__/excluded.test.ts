import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import DATA from '../../../data/cefr-j-v1.5-excluded.json';
import { EXCLUDED_BY_POS, EXCLUDED_HEADWORDS } from '../excluded';
import { CefrJDatasetSchema, mapCefrJPos } from '../normalize';
import { isShadowedByExcludedPos } from '../shadowed';

/**
 * The committed function-word list (B6.7a): generated from the source CSV by
 * scripts/build-cefr-j-excluded.ts. The CSV is not in the repo, so the list is
 * tied to the committed dataset instead: it must flag exactly the entries the
 * dataset marks `shadowedByExcludedPos` (the same derivation, ./shadowed.ts).
 */

const RAW = CefrJDatasetSchema.parse(
  JSON.parse(readFileSync(new URL('../../../data/cefr-j-v1.5.json', import.meta.url), 'utf8')),
);

describe('the excluded headwords (function words)', () => {
  it('carries the source and its six left-out tags, each one the import drops', () => {
    expect(DATA.source).toMatchObject({ name: RAW.source.name, version: RAW.source.version });
    expect(DATA.source.citation).toBe(RAW.source.citation);
    expect(Object.keys(EXCLUDED_BY_POS)).toEqual([
      'be-verb',
      'determiner',
      'do-verb',
      'have-verb',
      'infinitive-to',
      'modal auxiliary',
    ]);
    for (const tag of Object.keys(EXCLUDED_BY_POS)) expect(mapCefrJPos(tag)).toBeNull();
    expect(EXCLUDED_HEADWORDS.size).toBe(80);
  });

  it('holds the spec’s classes: be/do/have, modals, determiners, infinitive-to', () => {
    for (const w of ['be', 'is', 'was', 'being', 'do', 'does', 'did', 'have', 'had', 'having']) {
      expect(EXCLUDED_HEADWORDS.has(w), w).toBe(true);
    }
    for (const w of [
      'can',
      'must',
      'should',
      'will',
      'would',
      'have to',
      'the',
      'a',
      'my',
      'every',
    ]) {
      expect(EXCLUDED_HEADWORDS.has(w), w).toBe(true);
    }
    expect(EXCLUDED_BY_POS['infinitive-to']).toEqual(['to']);
    for (const w of ['apple', 'run', 'often', 'and', 'it'])
      expect(EXCLUDED_HEADWORDS.has(w)).toBe(false);
  });

  it('flags exactly the dataset’s shadowedByExcludedPos entries (same derivation)', () => {
    const flagged = RAW.entries.filter((e) => isShadowedByExcludedPos(e, EXCLUDED_HEADWORDS));
    expect(flagged.length).toBe(58);
    expect(flagged).toEqual(RAW.entries.filter((e) => e.shadowedByExcludedPos));
  });

  it('keys are lower case, trimmed, sorted and unique per tag', () => {
    for (const keys of Object.values(EXCLUDED_BY_POS)) {
      expect(keys).toEqual([...new Set(keys)].sort());
      for (const k of keys) expect(k).toBe(k.trim().toLowerCase());
    }
  });
});
