import { describe, expect, it } from 'vitest';
import { loadCefrJDataset } from '../dataset';
import { normalizeDataset } from '../normalize';
import { EXCLUDED_PARADIGM_GAPS, excludedHeadwordKeys, isShadowedByExcludedPos } from '../shadowed';

describe('excludedHeadwordKeys (B6.2b)', () => {
  const keys = excludedHeadwordKeys([
    { headword: 'can', pos: 'modal auxiliary' },
    { headword: "'m", pos: 'be-verb' },
    { headword: 'The', pos: 'determiner' },
    { headword: 'have to/have got to', pos: 'modal auxiliary' },
    { headword: 'to', pos: 'infinitive-to' },
    { headword: 'had', pos: 'have-verb' },
    { headword: 'wash', pos: 'verb' },
    { headword: 'a.m./A.M./am/AM', pos: 'adverb' },
  ]);

  it('every spelling of a left-out row, lower-cased; kept rows add nothing', () => {
    expect([...keys].sort()).toEqual(
      ["'m", 'being', 'can', 'had', 'have got to', 'have to', 'having', 'the', 'to'].sort(),
    );
  });

  it('the be-/have-verb paradigm gaps come with their auxiliary', () => {
    expect(EXCLUDED_PARADIGM_GAPS).toEqual({ 'be-verb': ['being'], 'have-verb': ['having'] });
    expect(excludedHeadwordKeys([{ headword: 'is', pos: 'be-verb' }]).has('being')).toBe(true);
    expect(excludedHeadwordKeys([{ headword: 'do', pos: 'do-verb' }]).has('being')).toBe(false);
  });

  it('a kept entry is shadowed by its lemma only — not by a variant, never a left-out entry', () => {
    expect(isShadowedByExcludedPos({ lemma: 'Can', pos: 'noun' }, keys)).toBe(true);
    expect(isShadowedByExcludedPos({ lemma: 'a.m.', pos: 'adverb' }, new Set(['am']))).toBe(false);
    expect(isShadowedByExcludedPos({ lemma: 'can', pos: 'modal auxiliary' }, keys)).toBe(false);
    expect(isShadowedByExcludedPos({ lemma: 'wash', pos: 'verb' }, keys)).toBe(false);
  });

  it('normalizeDataset carries the flag and folds it across duplicates', () => {
    const source = {
      name: 'n',
      version: '1',
      citation: 'c',
      url: 'https://example.com',
      terms: 't',
      selection: 's',
      topics: 't',
    };
    const { lexemes } = normalizeDataset({
      source,
      entries: [
        { lemma: 'can', pos: 'noun', cefrJLevel: 'B1' },
        { lemma: 'can', pos: 'noun', cefrJLevel: 'A2', shadowedByExcludedPos: true },
        { lemma: 'wash', pos: 'verb', cefrJLevel: 'A1' },
      ],
    });
    expect(lexemes.map((l) => [l.lemmaKey, l.cefrLevel, l.shadowedByExcludedPos])).toEqual([
      ['can', 'A2', true],
      ['wash', 'A1', undefined],
    ]);
  });
});

describe('the committed dataset (B6.2b flags)', () => {
  const { lexemes } = loadCefrJDataset();
  const flag = (lemmaKey: string, pos: string) =>
    lexemes.find((l) => l.lemmaKey === lemmaKey && l.pos === pos)?.shadowedByExcludedPos ?? false;

  it('can noun and being noun are shadowed; wash, a.m. and time are not', () => {
    expect(flag('can', 'NOUN')).toBe(true);
    expect(flag('being', 'NOUN')).toBe(true);
    expect(flag('to', 'PREPOSITION')).toBe(true);
    expect(flag('wash', 'VERB')).toBe(false);
    expect(flag('wash', 'NOUN')).toBe(false);
    expect(flag('a.m.', 'ADVERB')).toBe(false);
    expect(flag('time', 'NOUN')).toBe(false);
  });

  it('58 entries flagged (CEFR-J 1.5 CSV, add-cefr-j-shadowed.ts)', () => {
    expect(lexemes.filter((l) => l.shadowedByExcludedPos).length).toBe(58);
  });
});
