import { readFileSync } from 'node:fs';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { EXCLUDED_HEADWORDS } from '@englishlearn/db/vocab/excluded';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { CONTRACTIONS } from '../contractions';
import { normalizeTerm } from '../forms';
import {
  GENERATION_CANDIDATE_MAX_CHARS,
  GENERATION_GATE_REASONS,
  GenerationGateReasonSchema,
  isGenerationCandidateAllowed,
} from '../generation-gate';
import {
  buildCatalogueIndex,
  isCatalogueTerm,
  isFunctionWordTerm,
  MULTIWORD_MAX_TOKENS,
  matchCandidates,
} from '../match';
import { COLLOQUIAL_REDUCTIONS } from '../reductions';
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
    expect(GENERATION_GATE_REASONS).toEqual([
      'apostrophe',
      'contraction',
      'function_word',
      'colloquial',
      'too_long',
      'not_latin',
      'empty',
    ]);
    for (const r of GENERATION_GATE_REASONS) expect(GenerationGateReasonSchema.parse(r)).toBe(r);
    expect(GenerationGateReasonSchema.safeParse('proper_noun').success).toBe(false);
  });

  it('allows a word the catalogue lacks, and a catalogue word with an apostrophe', () => {
    for (const c of [
      'qwerty',
      'brekfast',
      'tom',
      'zzyzx road',
      "o'clock",
      'O’Clock',
      // Accents fold; a hyphen, a dot or a slash inside a word is a spelling.
      'Café',
      'naïve',
      'e-bike',
      'mp4',
      'ph.d',
      'and/or blorf',
    ]) {
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
      'qwerty`',
      'don＇t',
      "'tis",
      "ma'am",
    ]) {
      expect(refused(c), c).toBe('apostrophe');
    }
    // A catalogue spelling or form with an apostrophe passes: the catalogue comes first.
    expect(gate('o‘clock')).toEqual({ ok: true });
  });

  it('word by word: a function word, contraction or reduction inside a candidate refuses it (multi-word bypass)', () => {
    for (const [c, reason] of [
      ['the blorf', 'function_word'],
      ['have to blorf', 'function_word'],
      ['blorf was', 'function_word'],
      ['blorf the zorp', 'function_word'],
      ['ought to blorf', 'function_word'],
      ['my blorf', 'function_word'],
      ['gonna blorf', 'colloquial'],
      ['blorf wanna', 'colloquial'],
      // An apostrophe anywhere in an unknown candidate is refused as such first.
      ["don't blorf", 'apostrophe'],
      ["blorf that'll", 'apostrophe'],
    ] as const) {
      expect(refused(c), c).toBe(reason);
    }
  });

  it('word by word: the catalogue comes first, as in the matcher — a catalogue homograph inside is fine', () => {
    // `to` (preposition), `can` (noun), `that`, `will` (noun) are catalogue words.
    for (const w of ['to', 'can', 'that']) {
      expect(isFunctionWordTerm(w) && isCatalogueTerm(INDEX, w), w).toBe(true);
    }
    for (const c of ['blorf to zorp', 'look forward to', 'blorf can', 'zzyzx road', 'ice blorf']) {
      expect(gate(c), c).toEqual({ ok: true });
    }
    // Multi-word nonsense with nothing closed-class in it is the LLM's to judge.
    expect(gate('blorf zorp quux')).toEqual({ ok: true });
  });

  it('colloquial: every reduction, alone, in any case (#46); its words are function or catalogue words', () => {
    expect([...COLLOQUIAL_REDUCTIONS.keys()]).toEqual(
      expect.arrayContaining(['gonna', 'wanna', 'gotta']),
    );
    for (const [form, stands] of COLLOQUIAL_REDUCTIONS) {
      expect(isCatalogueTerm(INDEX, form), form).toBe(false);
      expect(CONTRACTIONS.has(form), form).toBe(false);
      for (const text of [form, form.toUpperCase(), ` ${form}. `]) {
        expect(refused(text), text).toBe('colloquial');
      }
      expect(stands.length, form).toBeGreaterThanOrEqual(2);
      // Each word is a catalogue or function word — or the phrase itself is one (`ought to`).
      const phrase = isFunctionWordTerm(stands.join(' '));
      for (const w of stands) {
        expect(phrase || isCatalogueTerm(INDEX, w) || isFunctionWordTerm(w), `${form}: ${w}`).toBe(
          true,
        );
      }
    }
  });

  it('too_long: over 40 characters or over 4 words, at the boundary; a huge input is refused unread', () => {
    expect(GENERATION_CANDIDATE_MAX_CHARS).toBe(40);
    expect(MULTIWORD_MAX_TOKENS).toBe(4);
    expect(gate('a'.repeat(40).replace(/^a/, 'b'))).toEqual({ ok: true });
    expect(refused('b'.repeat(41))).toBe('too_long');
    expect(gate('blorf zorp quux flarn')).toEqual({ ok: true });
    expect(refused('blorf zorp quux flarn glip')).toBe('too_long');
    // Normalized first: padding and trimmed punctuation do not count.
    expect(gate(`  "${'b'.repeat(40)}"  `)).toEqual({ ok: true });
    expect(refused('the '.repeat(5000))).toBe('too_long');
  });

  it('not_latin: another script, a symbol inside a word, or no letter at all; empty: nothing left', () => {
    for (const c of [
      'слово',
      'blorf слово',
      'größe',
      'blørf',
      'bl€rf',
      'blorf_zorp',
      'a+b',
      '123',
      '24/7',
      '日本',
    ]) {
      expect(refused(c), c).toBe('not_latin');
    }
    for (const c of ['', '   ', '…', '"!?"', '--'])
      expect(refused(c), JSON.stringify(c)).toBe('empty');
  });

  it('the paste import’s not-found terms never hit the contraction or function-word rules', () => {
    const texts = [
      ...['learner-list.txt', 'a2-prose.txt', 'messy-list.txt'].map((f) =>
        readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'),
      ),
      "That'll work, who'd guess, ain't it funny, y'all need a little help",
      "I'm sure it's Tom's, and don't forget the children's toys, rock'n'roll",
      'I am gonna visit zorpland, we wanna see the blorf, kinda far',
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
      ['zorpland', null],
      ['blorf', null],
    ]);
  });
});
