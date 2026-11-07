import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import { lexemeSlug } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { buildCatalogueIndex, type CatalogueWord, matchCandidates } from '../match';
import { tokenizePaste } from '../tokenize';

const w = (lemma: string, pos: PartOfSpeechValue, rank: number | null = null): CatalogueWord => ({
  slug: lexemeSlug({ lemmaKey: lemma, pos }),
  lemma,
  lemmaKey: lemma,
  pos,
  variants: [],
  frequencyRank: rank,
});
const INDEX = buildCatalogueIndex([
  w('go', 'VERB', 10),
  w('child', 'NOUN', 40),
  w('bus', 'NOUN', 300),
  w('stop', 'VERB', 200),
  w('stop', 'NOUN', 250),
  w('bus stop', 'NOUN', 900),
  // Tied like the real catalogue (one wordfreq form, both senses primary): slug order decides.
  w('run', 'VERB', 100),
  w('run', 'NOUN', 100),
  w('get up', 'PHRASAL_VERB', 600),
  w('get up', 'NOUN', 600), // an outfit; ties with the phrasal verb (slug order: noun first)
  w('get', 'VERB', 15),
  w('apple', 'NOUN', 500),
  w('study', 'VERB', 150),
  w('big', 'ADJECTIVE', 120),
  w('dog', 'NOUN', 350),
  w('leave', 'VERB', 60),
  w('left', 'ADJECTIVE', 220),
  w('see', 'VERB', 20),
  w('saw', 'NOUN', 2000),
  w('work', 'NOUN', 50),
  w('work', 'VERB', 30),
  w('build', 'VERB', 180),
  w('building', 'NOUN', 210),
  w('woman', 'NOUN', 90),
  w('policeman', 'NOUN', 1500),
  w('part-time', 'ADJECTIVE', 1800),
  w('full-time', 'ADJECTIVE', 1700),
  w('make-up', 'NOUN', 2500),
  // Closed class (#33): ranked like the real catalogue (after content words), but
  // `like` the preposition outranks the verb here, so only the class rule picks the verb.
  w('to', 'PREPOSITION', 3000),
  w('and', 'CONJUNCTION', 3001),
  w('next to', 'PREPOSITION', 3002),
  w('not', 'ADVERB', 3003),
  w('like', 'PREPOSITION', 65),
  w('like', 'VERB', 70),
  w('always', 'ADVERB', 80),
]);

const match = (text: string, limit?: number) => {
  const tokens = tokenizePaste(text);
  if (!tokens.ok) throw new Error(tokens.error);
  return matchCandidates(tokens.candidates, INDEX, limit);
};
/** term → preselected | (alternatives), per group. */
const show = (text: string) => {
  const m = match(text);
  const fmt = (e: (typeof m.matched)[number]) =>
    `${e.term} → ${e.preselected ?? '?'}${e.slugs.length > 1 ? ` (${e.slugs.filter((s) => s !== e.preselected).join(' ')})` : ''}`;
  return { matched: m.matched.map(fmt), lemmatized: m.lemmatized.map(fmt), notFound: m.notFound };
};

describe('matchCandidates (B6-SPEC §5)', () => {
  it('the e2e paste: three matched, two lemmatized, one not found — five words preselected', () => {
    expect(show('went, children, bus stop, to run, apple - яблоко, qwerty')).toEqual({
      matched: ['bus stop → bus-stop-noun', 'run → run-verb (run-noun)', 'apple → apple-noun'],
      lemmatized: ['went → go-verb', 'children → child-noun'],
      notFound: ['qwerty'],
    });
  });

  it.each([
    ['running', 'run-verb'],
    ['studies', 'study-verb'],
    ['bigger', 'big-adjective'],
    ['women', 'woman-noun'],
    ['policemen', 'policeman-noun'],
    ['works', 'work-verb'],
  ])('%s is lemmatized to %s (one lemma: preselected)', (form, slug) => {
    expect(match(form).lemmatized).toEqual([
      expect.objectContaining({ term: form, preselected: slug }),
    ]);
  });

  it('left and saw: several lemmas, the exact word preselected, the other offered', () => {
    expect(show('left; saw').lemmatized).toEqual([
      'left → left-adjective (leave-verb)',
      'saw → saw-noun (see-verb)',
    ]);
  });

  it('after a dropped `to` a verb is preselected, the noun offered unchecked (#39)', () => {
    expect(show('to run').matched).toEqual(['run → run-verb (run-noun)']);
    // Without `to`, the tie goes to slug order; a `to` before an article is no infinitive.
    expect(show('run').matched).toEqual(['run → run-noun (run-verb)']);
    expect(show('to the run').matched).toEqual(['run → run-noun (run-verb)']);
    expect(show('to get up').matched).toEqual(['get up → get-up-phrasal-verb (get-up-noun)']);
  });

  it('closed-class words are offered unchecked, never preselected (#33)', () => {
    expect(show('to, and, next to, not, like, always').matched).toEqual([
      'to → ?',
      'and → ?',
      'next to → ?',
      'not → ?',
      'like → like-verb (like-preposition)',
      'always → always-adverb',
    ]);
  });

  it('work: matched, the primary part of speech (best frequency rank) preselected', () => {
    expect(show('work').matched).toEqual(['work → work-verb (work-noun)']);
  });

  it('an exact word beats regular forms of other lemmas: building is the noun', () => {
    expect(show('building')).toEqual({
      matched: ['building → building-noun'],
      lemmatized: [],
      notFound: [],
    });
  });

  it('multiword first, inside running text too; articles inside text are function words', () => {
    expect(show('I waited at the bus stop').matched).toEqual(['bus stop → bus-stop-noun']);
    expect(show('I waited at the bus stop').notFound).toEqual(['i', 'waited', 'at']);
    expect(match('I waited at the bus stop').functionWords).toEqual(['the']);
    expect(show('the dog').matched).toEqual(['dog → dog-noun']);
  });

  it('hyphenated words match whole; a short unknown term is one not-found term', () => {
    expect(show('part-time - неполный день, full-time, make-up').matched).toEqual([
      'part-time → part-time-adjective',
      'full-time → full-time-adjective',
      'make-up → make-up-noun',
    ]);
    expect(show('ice cream').notFound).toEqual(['ice cream']);
    // A function word is no part of an unknown term; two stretches stay two words.
    expect(match('my ice cream')).toMatchObject({ notFound: ['ice cream'], functionWords: ['my'] });
    expect(match('ice the cream')).toMatchObject({
      notFound: ['ice', 'cream'],
      functionWords: ['the'],
    });
  });

  it('the same words twice are one entry, matched if either is', () => {
    expect(show('apples, apple, Apple')).toEqual({
      matched: ['apple → apple-noun'],
      lemmatized: [],
      notFound: [],
    });
  });

  it('past the limit, distinct results are counted, not listed', () => {
    const m = match('apple, dog, qwerty, zzz, bus', 3);
    expect([...m.matched, ...m.lemmatized].map((e) => e.term)).toEqual(['apple', 'dog']);
    expect(m.notFound).toEqual(['qwerty']);
    expect(m.notProcessed).toBe(2);
  });
});
