import { describe, expect, it } from 'vitest';
import { type FrequencyRow, loadFrequencyDataset, planFrequency } from '../frequency';

const row = (id: string, lemmaKey: string, status = 'PUBLISHED'): FrequencyRow => ({
  id,
  lemmaKey,
  status,
  frequencyZipf: null,
  frequencyRank: null,
});

describe('planFrequency', () => {
  const zipf = { time: 6.29, friend: 5.37, care: 5.56, march: 4.6, jade: 3.78, b: 4.6, zero: 0 };

  it('dense-ranks PUBLISHED lexemes by zipf DESC, ties by lemmaKey ASC, homonyms sharing one rank', () => {
    const plan = planFrequency(
      [
        row('1', 'jade'),
        row('2', 'march'),
        row('3', 'time'),
        row('4', 'march'),
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
      '4': 5, // march again: same lemmaKey, same rank
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
        row('f', 'care', 'REVIEW'), // shares care's lemmaKey, but is not PUBLISHED
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
