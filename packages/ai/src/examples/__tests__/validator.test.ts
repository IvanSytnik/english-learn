import { describe, expect, it } from 'vitest';
import type { PendingExamples } from '../types';
import { validateExamplesBatch } from '../validator';

const T = { ru: 'Это пример.', uk: 'Це приклад.', de: 'Das ist ein Beispiel.' };
const ex = (sentence: string, clozeTarget: string, translation = T) => ({
  sentence,
  clozeTarget,
  translation,
});
const pending = (over: Partial<PendingExamples> = {}): PendingExamples => ({
  key: '1',
  lemmaKey: 'run',
  lemma: 'run',
  pos: 'VERB',
  sense: '',
  cefrLevel: 'A1',
  topic: 'sport',
  meaning: 'to move fast on foot',
  existing: ['I run in the park every day.'],
  existingForm: 'run',
  base: 'I run in the park every day.',
  ...over,
});
const answer = (examples: unknown[], over: object = {}) => ({
  items: [{ key: '1', lemma: 'run', examples, ...over }],
});
const GOOD = [
  ex('She ran to the bus stop this morning.', 'ran'),
  ex('We often run together after school.', 'run'),
];
const reasons = (data: unknown, p = pending()) =>
  validateExamplesBatch([p], data).rejected.flatMap((r) => r.reasons);

describe('validateExamplesBatch (B6.4a)', () => {
  it('accepts two valid, new, varied examples with the base they were made for', () => {
    const { accepted, rejected } = validateExamplesBatch([pending()], answer(GOOD));
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([
      {
        lemmaKey: 'run',
        pos: 'VERB',
        sense: '',
        base: 'I run in the park every day.',
        examples: GOOD,
      },
    ]);
  });

  it('wants exactly two examples', () => {
    expect(reasons(answer([GOOD[0]]))).toEqual(['expected 2 examples, got 1']);
    expect(reasons(answer([...GOOD, GOOD[0]]))).toEqual(['expected 2 examples, got 3']);
  });

  it('the cloze target exactly once, as a whole word (pitfall 177)', () => {
    expect(reasons(answer([ex('She runs and runs to the bus stop.', 'runs'), GOOD[1]]))).toEqual([
      expect.stringMatching(/^examples\.0\.clozeTarget: /),
    ]);
    expect(reasons(answer([ex('She was rerunning the old race again.', 'run'), GOOD[1]]))).toEqual([
      expect.stringMatching(/^examples\.0\.clozeTarget: /),
    ]);
  });

  it('6..18 words', () => {
    expect(reasons(answer([ex('She ran home.', 'ran'), GOOD[1]]))).toEqual([
      'examples.0: 3 words, not 6..18',
    ]);
    const long = `She ran ${'very '.repeat(17)}fast.`;
    expect(reasons(answer([ex(long, 'ran'), GOOD[1]]))).toEqual([
      'examples.0: 20 words, not 6..18',
    ]);
  });

  it('never repeats an existing example or itself (normalized)', () => {
    expect(reasons(answer([ex('i RUN in the park, every day!', 'RUN'), GOOD[0]]))).toEqual([
      'examples.0: repeats an existing example',
    ]);
    expect(reasons(answer([GOOD[0], ex('She ran to the bus stop this morning!', 'ran')]))).toEqual([
      'the two examples are the same sentence',
    ]);
  });

  it('a word that inflects: one of the two varies the form or the place of examples[0]', () => {
    const same = [
      ex('I run to school when I am late.', 'run'),
      ex('They run around the garden after lunch.', 'run'),
    ];
    expect(reasons(answer(same))).toEqual([
      'neither example varies the form "run" or its place (middle) of examples[0]',
    ]);
    // Same form, but at the start: varied.
    const placed = [ex('Run to the door and open it now.', 'Run'), same[1]];
    expect(reasons(answer(placed))).toEqual([]);
    // A preposition does not inflect: no variety rule.
    const prep = pending({
      lemmaKey: 'under',
      lemma: 'under',
      pos: 'PREPOSITION',
      existing: ['The cat is under the bed.'],
      existingForm: 'under',
      base: 'The cat is under the bed.',
    });
    expect(
      reasons(
        {
          items: [
            {
              key: '1',
              lemma: 'under',
              examples: [
                ex('The keys are under the table now.', 'under'),
                ex('We sat under a big old tree.', 'under'),
              ],
            },
          ],
        },
        prep,
      ),
    ).toEqual([]);
  });

  it('the B2.4 script checks on every translation', () => {
    const bad = { ru: 'Це її приклад.', uk: 'Это пример.', de: 'Пример.' };
    expect(
      reasons(answer([ex('She ran to the bus stop this morning.', 'ran', bad), GOOD[1]])),
    ).toEqual([
      'examples.0.translation.ru is not Russian',
      'examples.0.translation.uk is not Ukrainian',
      'examples.0.translation.de is not German',
    ]);
  });

  it('a missing translation, an unanswered, duplicated or foreign item, a bad response', () => {
    const noDe = { ru: T.ru, uk: T.uk, de: ' ' };
    expect(
      reasons(
        answer([ex('She ran to the bus stop this morning.', 'ran', noDe as typeof T), GOOD[1]]),
      ),
    ).toEqual([expect.stringMatching(/^examples\.0\.translation\.de: /)]);
    expect(reasons({ items: [] })).toEqual(['not answered']);
    expect(reasons({ items: [...answer(GOOD).items, ...answer(GOOD).items] })).toEqual([
      'answered more than once',
    ]);
    expect(reasons(answer(GOOD, { lemma: 'walk' }))).toEqual(['answered for "walk"']);
    expect(reasons({ nope: true })).toEqual(['response does not match the wire schema']);
  });

  it('one bad word never rejects the others', () => {
    const two = [pending(), pending({ key: '2', lemmaKey: 'walk', lemma: 'walk' })];
    const out = validateExamplesBatch(two, {
      items: [
        { key: '1', lemma: 'run', examples: GOOD },
        { key: '2', lemma: 'walk', examples: [] },
      ],
    });
    expect(out.accepted.map((a) => a.lemmaKey)).toEqual(['run']);
    expect(out.rejected.map((r) => r.lemmaKey)).toEqual(['walk']);
  });
});
