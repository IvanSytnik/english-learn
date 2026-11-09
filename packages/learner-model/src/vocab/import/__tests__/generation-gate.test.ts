import { readFileSync } from 'node:fs';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { EXCLUDED_HEADWORDS } from '@englishlearn/db/vocab/excluded';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { CONTRACTIONS } from '../contractions';
import { normalizeTerm } from '../forms';
import {
  GENERATION_GATE_REASONS,
  GenerationGateReasonSchema,
  isGenerationCandidateAllowed,
} from '../generation-gate';
import { buildCatalogueIndex, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

/**
 * The B6.10 pre-LLM gate (V2-20 part 2) over the real catalogue, the 80
 * function words and the generated contraction table: each reason, the
 * catalogue first for apostrophes, and the paste import's not-found terms.
 */

const { lexemes } = loadCefrJDataset();
const INDEX = buildCatalogueIndex(
  [...slugIndex(lexemes).bySlug].map(([slug, l]) => ({
    slug,
    lemma: l.lemma,
    lemmaKey: l.lemmaKey,
    pos: l.pos,
    sense: l.sense,
    variants: l.variants,
    frequencyRank: null,
  })),
);
const gate = (candidate: string) => isGenerationCandidateAllowed(candidate, { index: INDEX });
const refused = (candidate: string) => {
  const r = gate(candidate);
  return r.ok ? null : r.reason;
};

describe('the B6.10 pre-LLM gate (V2-20)', () => {
  it('the reasons are a closed set, ready for a Zod schema', () => {
    expect(GENERATION_GATE_REASONS).toEqual(['apostrophe', 'contraction', 'function_word']);
    for (const r of GENERATION_GATE_REASONS) expect(GenerationGateReasonSchema.parse(r)).toBe(r);
    expect(GenerationGateReasonSchema.safeParse('proper_noun').success).toBe(false);
  });

  it('allows a word the catalogue lacks, and a catalogue word with an apostrophe', () => {
    for (const c of ['qwerty', 'brekfast', 'tom', 'zzyzx road', "o'clock", 'O’Clock']) {
      expect(gate(c), c).toEqual({ ok: true });
    }
  });

  it('contraction: every entry of the table, straight, curly or upper case', () => {
    expect(CONTRACTIONS.size).toBe(92);
    for (const c of CONTRACTIONS.keys()) {
      for (const text of [c, c.replace("'", '’'), c.toUpperCase()]) {
        expect(refused(text), text).toBe('contraction');
      }
    }
  });

  it('function_word: each of the 80 headwords, a catalogue homograph too (`can`)', () => {
    const words = [...new Set([...EXCLUDED_HEADWORDS].map(normalizeTerm))];
    expect(words.length).toBe(80);
    for (const w of words) expect(refused(w), w).toBe('function_word');
    for (const w of ['The', 'have to', "'s", 'can']) expect(refused(w), w).toBe('function_word');
  });

  it('apostrophe: any spelling of it, unless the catalogue knows the term', () => {
    for (const c of [
      "rock'n'roll",
      "children's",
      "qwerty's",
      'y’know',
      'gonna`',
      'don＇t',
      "'tis",
      "ma'am",
    ]) {
      expect(refused(c), c).toBe('apostrophe');
    }
    // A catalogue spelling or form with an apostrophe passes: the catalogue comes first.
    expect(gate('o‘clock')).toEqual({ ok: true });
  });

  it('the paste import’s not-found terms never hit the contraction or function-word rules', () => {
    const texts = [
      ...['learner-list.txt', 'a2-prose.txt', 'messy-list.txt'].map((f) =>
        readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'),
      ),
      "That'll work, who'd guess, ain't it funny, y'all need a little help",
      "I'm sure it's Tom's, and don't forget the children's toys, rock'n'roll",
    ];
    const reasons = texts.flatMap((text) => {
      const tokens = tokenizePaste(text);
      if (!tokens.ok) throw new Error(tokens.error);
      return matchCandidates(tokens.candidates, INDEX).notFound.map((t) => [t, refused(t)]);
    });
    expect(reasons).toEqual([
      ['brekfast', null],
      ['qwerty', null],
      ['quotes', null],
      ['geese', null],
      ['tom', null],
      ["rock'n'roll", 'apostrophe'],
    ]);
  });
});
