import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PartOfSpeechValue } from '../../schemas/lexeme';
import {
  CLOSED_CLASS_POS,
  type FrequencyRow,
  FUNCTION_ADVERBS,
  isClosedClass,
  loadFrequencyDataset,
  PRIMARY_POS_ORDER,
  planFrequency,
  primarySenseIds,
} from '../frequency';

const row = (
  id: string,
  lemmaKey: string,
  status = 'PUBLISHED',
  over: Partial<FrequencyRow> = {},
): FrequencyRow => ({
  id,
  lemmaKey,
  pos: 'NOUN',
  sense: '',
  cefrLevel: 'A1',
  status,
  frequencyZipf: null,
  frequencyRank: null,
  ...over,
});

describe('planFrequency', () => {
  const zipf = { time: 6.29, friend: 5.37, care: 5.56, march: 4.6, jade: 3.78, b: 4.6, zero: 0 };

  it('dense-ranks PUBLISHED content words by zipf DESC, ties by lemmaKey ASC', () => {
    const plan = planFrequency(
      [
        row('1', 'jade'),
        row('2', 'march'),
        row('3', 'time'),
        row('5', 'care'),
        row('6', 'b'),
        row('7', 'friend'),
      ],
      zipf,
    );
    expect(Object.fromEntries(plan.map((p) => [p.id, p.frequencyRank]))).toEqual({
      '3': 1, // time 6.29
      '5': 2, // care 5.56
      '7': 3, // friend 5.37
      '6': 4, // b 4.6 (tie with march, b < march)
      '2': 5,
      '1': 6, // jade
    });
    expect(plan.find((p) => p.id === '3')?.frequencyZipf).toBe(6.29);
  });

  it('zipf 0 or missing → null zipf and null rank; not PUBLISHED → zipf kept, rank null, no gap', () => {
    const plan = planFrequency(
      [
        row('a', 'zero'),
        row('b', 'unknown'),
        row('c', 'time', 'REVIEW'),
        row('d', 'care'),
        row('e', 'toString'),
        row('f', 'care', 'REVIEW', { pos: 'VERB' }), // shares care's key, not PUBLISHED
      ],
      zipf,
    );
    expect(plan).toEqual([
      { id: 'a', frequencyZipf: null, frequencyRank: null },
      { id: 'b', frequencyZipf: null, frequencyRank: null },
      { id: 'c', frequencyZipf: 6.29, frequencyRank: null },
      { id: 'd', frequencyZipf: 5.56, frequencyRank: 1 },
      { id: 'e', frequencyZipf: null, frequencyRank: null },
      { id: 'f', frequencyZipf: 5.56, frequencyRank: null },
    ]);
  });

  it('B6.2a: content words, then second senses, then closed-class words; zipf stays the raw lemma value', () => {
    const z = { to: 7.4, of: 7.4, go: 6.5, name: 5.8, please: 5.7, like: 6.4, rice: 4.8 };
    const plan = planFrequency(
      [
        row('to', 'to', 'PUBLISHED', { pos: 'PREPOSITION' }),
        row('of', 'of', 'PUBLISHED', { pos: 'PREPOSITION' }),
        row('go-v', 'go', 'PUBLISHED', { pos: 'VERB' }),
        row('go-n', 'go', 'PUBLISHED', { pos: 'NOUN', cefrLevel: 'B1' }),
        row('name-n', 'name'),
        row('name-v', 'name', 'PUBLISHED', { pos: 'VERB', cefrLevel: 'B1' }),
        row('please-i', 'please', 'PUBLISHED', { pos: 'INTERJECTION' }),
        row('please-v', 'please', 'PUBLISHED', { pos: 'VERB', cefrLevel: 'B1' }),
        row('like-v', 'like', 'PUBLISHED', { pos: 'VERB' }),
        row('like-p', 'like', 'PUBLISHED', { pos: 'PREPOSITION' }),
        row('rice', 'rice'),
      ],
      z,
    );
    const rank = Object.fromEntries(plan.map((p) => [p.id, p.frequencyRank]));
    expect(rank).toEqual({
      'go-v': 1, // 6.5
      'like-v': 2, // 6.4 — the verb is primary at A1 (VERB before PREPOSITION)
      'name-n': 3,
      'please-i': 4, // an interjection is content
      rice: 5,
      'go-n': 6, // second senses after every primary content word
      'name-v': 7,
      'please-v': 8,
      of: 9, // closed class last, of < to on a tie
      to: 10,
      'like-p': 11, // closed class and a second sense
    });
    expect(plan.find((p) => p.id === 'go-n')?.frequencyZipf).toBe(6.5);
  });

  it('the primary sense: lowest level, then the POS order, then sense — even when the lower level is a closed class', () => {
    const rows = [
      row('n-b1', 'round', 'PUBLISHED', { cefrLevel: 'B1' }),
      row('adj-a2', 'round', 'PUBLISHED', { pos: 'ADJECTIVE', cefrLevel: 'A2' }),
      row('prep-a2', 'round', 'PUBLISHED', { pos: 'PREPOSITION', cefrLevel: 'A2' }),
      row('bank-r', 'bank', 'PUBLISHED', { sense: 'river' }),
      row('bank-f', 'bank', 'PUBLISHED', { sense: 'finance' }),
      row('draft', 'round', 'DRAFT', { pos: 'VERB', cefrLevel: 'A1' }), // not PUBLISHED: ignored
    ];
    expect([...primarySenseIds(rows)].sort()).toEqual(['adj-a2', 'bank-f']);
    expect(PRIMARY_POS_ORDER.slice(0, 4)).toEqual(['NOUN', 'VERB', 'ADJECTIVE', 'ADVERB']);
  });

  it('closed class = preposition, conjunction, pronoun, other — not interjection', () => {
    expect([...CLOSED_CLASS_POS].sort()).toEqual([
      'CONJUNCTION',
      'OTHER',
      'PREPOSITION',
      'PRONOUN',
    ]);
  });

  it('B6.2b: a function adverb ranks with the closed classes; a content adverb and an interjection do not', () => {
    const z = { not: 6.7, just: 6.4, really: 6.0, please: 5.7, rice: 4.8, of: 7.4 };
    const plan = planFrequency(
      [
        row('not', 'not', 'PUBLISHED', { pos: 'ADVERB' }),
        row('just', 'just', 'PUBLISHED', { pos: 'ADVERB' }),
        row('really', 'really', 'PUBLISHED', { pos: 'ADVERB' }),
        row('please', 'please', 'PUBLISHED', { pos: 'INTERJECTION' }),
        row('rice', 'rice'),
        row('of', 'of', 'PUBLISHED', { pos: 'PREPOSITION' }),
      ],
      z,
    );
    expect(Object.fromEntries(plan.map((p) => [p.id, p.frequencyRank]))).toEqual({
      really: 1,
      please: 2,
      rice: 3,
      of: 4, // closed class by zipf: of 7.4, not 6.7, just 6.4
      not: 5,
      just: 6,
    });
  });

  it('FUNCTION_ADVERBS: a closed list, lemmaKeys only, and the spec examples are in it', () => {
    expect(FUNCTION_ADVERBS.size).toBeGreaterThanOrEqual(30);
    expect(FUNCTION_ADVERBS.size).toBeLessThanOrEqual(40);
    for (const w of FUNCTION_ADVERBS) expect(w).toBe(w.trim().toLowerCase());
    for (const w of [
      'not',
      'just',
      'now',
      'then',
      'also',
      'very',
      'so',
      'too',
      'here',
      'there',
      'only',
      'still',
    ])
      expect(FUNCTION_ADVERBS.has(w)).toBe(true);
    for (const w of ['always', 'often', 'well', 'really', 'today', 'please'])
      expect(FUNCTION_ADVERBS.has(w)).toBe(false);
    // only as an adverb: `so` the conjunction is closed by its POS, `just` the adjective is content
    expect(isClosedClass({ pos: 'ADJECTIVE', lemmaKey: 'just' })).toBe(false);
  });
});

const POS: PartOfSpeechValue[] = [...PRIMARY_POS_ORDER];
const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
const rowsArb = fc
  .array(
    fc.record({
      key: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'not'),
      pos: fc.constantFrom(...POS),
      sense: fc.constantFrom('', 'x'),
      cefrLevel: fc.constantFrom(...LEVELS),
      status: fc.constantFrom('PUBLISHED', 'PUBLISHED', 'REVIEW'),
    }),
    { maxLength: 30 },
  )
  .map((rs) =>
    // (lemmaKey, pos, sense) is unique in the table
    [...new Map(rs.map((r) => [`${r.key}|${r.pos}|${r.sense}`, r])).values()].map((r, i) =>
      row(`r${i}`, r.key, r.status, { pos: r.pos, sense: r.sense, cefrLevel: r.cefrLevel }),
    ),
  );
const zipfArb = fc.record({
  a: fc.double({ min: 1, max: 7, noNaN: true }),
  b: fc.double({ min: 1, max: 7, noNaN: true }),
  c: fc.double({ min: 1, max: 7, noNaN: true }),
  d: fc.constantFrom(4, 5),
  e: fc.constantFrom(4, 5),
  f: fc.constant(0),
  not: fc.double({ min: 1, max: 7, noNaN: true }),
});

describe('planFrequency properties (B6.2a)', () => {
  const ranked = (rows: FrequencyRow[], z: Record<string, number>) => {
    const plan = new Map(planFrequency(rows, z).map((p) => [p.id, p.frequencyRank]));
    return rows.flatMap((r) => {
      const rank = plan.get(r.id);
      return rank == null ? [] : [{ r, rank }];
    });
  };

  it('a closed-class word never ranks before a content word', () => {
    fc.assert(
      fc.property(rowsArb, zipfArb, (rows, z) => {
        const out = ranked(rows, z);
        const content = out.filter((x) => !isClosedClass(x.r));
        const closed = out.filter((x) => isClosedClass(x.r));
        for (const c of closed) for (const w of content) expect(c.rank).toBeGreaterThan(w.rank);
      }),
    );
  });

  it('exactly one primary per PUBLISHED lemmaKey', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const primary = primarySenseIds(rows);
        const keys = new Set(rows.filter((r) => r.status === 'PUBLISHED').map((r) => r.lemmaKey));
        for (const key of keys) {
          expect(rows.filter((r) => r.lemmaKey === key && primary.has(r.id))).toHaveLength(1);
        }
        for (const id of primary) {
          expect(rows.find((r) => r.id === id)?.status).toBe('PUBLISHED');
        }
      }),
    );
  });

  it('within a word class, a secondary sense ranks after every primary', () => {
    fc.assert(
      fc.property(rowsArb, zipfArb, (rows, z) => {
        const primary = primarySenseIds(rows);
        const out = ranked(rows, z);
        for (const closed of [true, false]) {
          const cls = out.filter((x) => isClosedClass(x.r) === closed);
          for (const s of cls.filter((x) => !primary.has(x.r.id)))
            for (const p of cls.filter((x) => primary.has(x.r.id)))
              expect(s.rank).toBeGreaterThan(p.rank);
        }
      }),
    );
  });

  it('dense ranks 1..n and deterministic under row order', () => {
    fc.assert(
      fc.property(rowsArb, zipfArb, (rows, z) => {
        const ranks = [...new Set(ranked(rows, z).map((x) => x.rank))].sort((a, b) => a - b);
        expect(ranks).toEqual(ranks.map((_, i) => i + 1));
        const byId = (p: { id: string }[]) => [...p].sort((a, b) => (a.id < b.id ? -1 : 1));
        expect(byId(planFrequency([...rows].reverse(), z))).toEqual(byId(planFrequency(rows, z)));
      }),
    );
  });
});

describe('the committed wordfreq dataset', () => {
  const dataset = loadFrequencyDataset();

  it('carries its licence and the attribution wordfreq asks for', () => {
    expect(dataset.source).toMatchObject({
      name: 'wordfreq',
      version: '3.1.1',
      licence: 'CC BY-SA 4.0',
    });
    for (const credit of [
      'Robyn Speer',
      'zenodo.7199437',
      'Google Books Ngrams',
      'OpenSubtitles',
      'SUBTLEX',
      'Marc Brysbaert',
    ]) {
      expect(dataset.source.attribution).toContain(credit);
    }
  });

  it('knows almost every catalogue lemma, with a frequent word above a rare one', () => {
    const values = Object.values(dataset.entries);
    expect(values.length).toBe(4406);
    expect(values.filter((z) => z === 0).length).toBeLessThan(10);
    expect(dataset.entries.time).toBeGreaterThan(dataset.entries.jade as number);
  });
});
