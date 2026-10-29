import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CreateDraftLexemeInputSchema } from '../../schemas/lexeme';
import { normalizeDataset } from '../normalize';

/**
 * The committed dataset (packages/db/data/cefr-j-v1.5.json) passes the whole
 * pure pipeline: a broken row, an unknown topic or an unresolved homonym
 * fails here, before any import runs.
 */

const raw = JSON.parse(
  readFileSync(new URL('../../../data/cefr-j-v1.5.json', import.meta.url), 'utf8'),
) as unknown;
const { source, lexemes, skipped } = normalizeDataset(raw);

describe('CEFR-J dataset v1.5', () => {
  it('cites the source as its terms require', () => {
    expect(source.citation).toBe(
      'The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.',
    );
  });

  it('holds A1–B1 only, with no row left out and no key collision', () => {
    expect(lexemes).toHaveLength(4944);
    expect(skipped).toEqual([]);
    expect(new Set(lexemes.map((l) => l.cefrLevel))).toEqual(new Set(['A1', 'A2', 'B1']));
  });

  it('keeps the March / march homonym apart by sense', () => {
    expect(
      lexemes
        .filter((l) => l.lemmaKey === 'march' && l.pos === 'NOUN')
        .map((l) => [l.lemma, l.sense, l.cefrJLevel]),
    ).toEqual([
      ['March', 'month', 'A1'],
      ['march', 'walk', 'B1'],
    ]);
  });

  it('makes every row a valid DRAFT lexeme', () => {
    for (const { topic: _topic, variants: _variants, lemmaKey: _key, ...lexeme } of lexemes) {
      CreateDraftLexemeInputSchema.parse({ ...lexeme, definitions: {}, translations: {} });
    }
  });
});
