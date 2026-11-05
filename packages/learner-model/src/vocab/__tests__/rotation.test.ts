import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { seedFromString } from '../../policy/rng';
import { buildVocabCard } from '../card';
import { rotatedExample } from '../variants/shared';
import { example, lex } from './fixtures';

/** B6.5 cloze rotation: example index = seedFromString(cardSeed) mod n over the valid examples. */

const SENTENCES = [
  example('She bought this lamp yesterday.', 'lamp'),
  example('The lamp in the hall is broken.', 'lamp'),
  example('Turn the lamp off, please.', 'lamp'),
];
const lamp = lex('lamp', { examples: SENTENCES });
const POOL = [lamp, lex('chair'), lex('table'), lex('door'), lex('window'), lex('bed')];

const clozeSentence = (seed: string) => {
  const card = buildVocabCard({ target: lamp, pool: POOL, mode: 'cloze', locale: 'ru', seed });
  if (card.view.mode !== 'cloze') throw new Error(`served ${card.view.mode}`);
  return card.view.sentence;
};
const gapped = (sentence: string) => sentence.replace(/\blamp\b/, PRACTICE_GAP);

describe('cloze rotation (B6.5)', () => {
  it('serves the example at seedFromString(cardSeed) mod n', () => {
    for (const seed of ['u1:i1:new', 'u1:i1:1730000000000', 'u2:i9:42', 's']) {
      const want = SENTENCES[seedFromString(seed) % SENTENCES.length]?.sentence ?? '';
      expect(clozeSentence(seed)).toBe(gapped(want));
    }
  });

  it('is deterministic: the same seed always shows the same sentence', () => {
    expect(clozeSentence('u1:i1:7')).toBe(clozeSentence('u1:i1:7'));
  });

  it('reaches every valid example across seeds', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => clozeSentence(`u:i:${i}`)));
    expect(seen).toEqual(new Set(SENTENCES.map((s) => gapped(s.sentence))));
  });

  it('a word with one example always shows it (the pre-rotation card)', () => {
    const one = { ...lamp, examples: [SENTENCES[1] as (typeof SENTENCES)[number]] };
    for (const seed of ['a', 'b', 'c', 'd']) expect(rotatedExample(one, seed)).toBe(SENTENCES[1]);
  });

  it('skips an example whose clozeTarget is not exactly one whole word of it', () => {
    const twice = example('A lamp is a lamp.', 'lamp');
    const absent = example('The light is on.', 'lamp');
    const word = { ...lamp, examples: [twice, SENTENCES[0], absent] as typeof SENTENCES };
    // Over many seeds only the valid one is ever picked (n = 1, not 3).
    for (let i = 0; i < 30; i++) expect(rotatedExample(word, `s${i}`)).toBe(SENTENCES[0]);
  });

  it('no valid example at all: null', () => {
    expect(rotatedExample({ ...lamp, examples: [] }, 's')).toBeNull();
  });

  it('keeps the fallback: a rotated blank no three words share in form → l1_to_en', () => {
    // "lamps" (plural): no other noun in the pool has a plural cloze target.
    const plural = example('Two lamps stood by the bed.', 'lamps');
    const word = { ...lamp, examples: [plural, plural, plural] };
    const card = buildVocabCard({
      target: word,
      pool: POOL,
      mode: 'cloze',
      locale: 'ru',
      seed: 's',
    });
    expect(card.view.mode).toBe('l1_to_en');
  });
});
