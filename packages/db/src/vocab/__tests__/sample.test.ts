import { describe, expect, it } from 'vitest';
import {
  formatLexemeSample,
  highlightCloze,
  pickSample,
  pickWeightedPerLevel,
  type SampleLexeme,
} from '../sample';

const lexeme = (extra: Partial<SampleLexeme> = {}): SampleLexeme => ({
  id: 'lx1',
  lemma: 'run',
  pos: 'VERB',
  sense: '',
  cefrLevel: 'A1',
  status: 'REVIEW',
  definitions: { en: 'to move fast on foot' },
  translations: { ru: 'бегать / бежать', uk: 'бігти', de: 'laufen' },
  examples: [
    {
      sentence: 'She ran to the bus.',
      clozeTarget: 'ran',
      translation: {
        ru: 'Она побежала к автобусу.',
        uk: 'Вона побігла до автобуса.',
        de: 'Sie lief zum Bus.',
      },
    },
  ],
  ...extra,
});

describe('pickSample', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }));

  it('is reproducible for a seed and differs across seeds', () => {
    expect(pickSample(rows, 5, 'a')).toEqual(pickSample(rows, 5, 'a'));
    expect(pickSample(rows, 5, 'a')).not.toEqual(pickSample(rows, 5, 'b'));
  });

  it('returns distinct rows, at most count, never more than there are', () => {
    const sample = pickSample(rows, 10, 'x');
    expect(new Set(sample.map((r) => r.id)).size).toBe(10);
    expect(pickSample(rows.slice(0, 3), 10, 'x')).toHaveLength(3);
  });
});

describe('highlightCloze', () => {
  it('brackets the whole-word target, whatever its case', () => {
    expect(highlightCloze('She ran to the bus.', 'ran')).toBe('She [ran] to the bus.');
    expect(highlightCloze('Ran home!', 'ran')).toBe('[Ran] home!');
    expect(highlightCloze('The rant. She ran.', 'ran')).toBe('The rant. She [ran].');
  });

  it('uses inverse video in colour mode', () => {
    expect(highlightCloze('She ran.', 'ran', true)).toBe('She \u001b[7mran\u001b[27m.');
  });

  it('flags a target that does not occur exactly once', () => {
    expect(highlightCloze('She walked.', 'ran')).toBe('She walked.  (! clozeTarget "ran")');
    expect(highlightCloze('Ran away, she ran on.', 'ran')).toBe(
      'Ran away, she ran on.  (! clozeTarget "ran")',
    );
  });
});

describe('formatLexemeSample', () => {
  it('shows lemma, POS, level, status, definition, glosses and the marked example', () => {
    expect(formatLexemeSample(lexeme()).split('\n')).toEqual([
      'run · VERB · A1 · REVIEW',
      '  en  to move fast on foot',
      '  ru  бегать / бежать  |  uk  бігти  |  de  laufen',
      '  ex  She [ran] to the bus.',
      '      ru Она побежала к автобусу.  |  uk Вона побігла до автобуса.  |  de Sie lief zum Bus.',
      '  id  lx1',
    ]);
  });

  it('shows the sense and survives an unlocalized DRAFT', () => {
    const text = formatLexemeSample(
      lexeme({
        lemma: 'March',
        sense: 'month',
        status: 'DRAFT',
        definitions: {},
        translations: {},
        examples: [],
      }),
    );
    expect(text.split('\n').slice(0, 4)).toEqual([
      'March (month) · VERB · A1 · DRAFT',
      '  en  —',
      '  ru  —  |  uk  —  |  de  —',
      '  ex  —',
    ]);
  });
});

describe('pickWeightedPerLevel', () => {
  const rows = ['A1', 'A2', 'B1'].flatMap((cefrLevel) =>
    Array.from({ length: 200 }, (_, i) => ({
      id: `${cefrLevel}-${i}`,
      cefrLevel,
      secondary: i < 40,
    })),
  );
  const weight = (r: { secondary: boolean }) => (r.secondary ? 2 : 1);

  it('takes perLevel distinct rows of every level, reproducibly', () => {
    const a = pickWeightedPerLevel(rows, { perLevel: 20, seed: 's', weight });
    expect(a).toEqual(pickWeightedPerLevel(rows, { perLevel: 20, seed: 's', weight }));
    expect(a).not.toEqual(pickWeightedPerLevel(rows, { perLevel: 20, seed: 't', weight }));
    expect(new Set(a.map((r) => r.id)).size).toBe(60);
    for (const level of ['A1', 'A2', 'B1']) {
      expect(a.filter((r) => r.cefrLevel === level)).toHaveLength(20);
    }
  });

  it('draws a weight-2 row about twice as often as a weight-1 row', () => {
    let secondary = 0;
    let total = 0;
    for (let s = 0; s < 200; s++) {
      const sample = pickWeightedPerLevel(rows, { perLevel: 10, seed: String(s), weight });
      secondary += sample.filter((r) => r.secondary).length;
      total += sample.length;
    }
    // 40 of 200 rows have weight 2: about 2·40 / (2·40 + 160) = 1/3 of the draws, not 1/5.
    expect(secondary / total).toBeGreaterThan(0.28);
    expect(secondary / total).toBeLessThan(0.4);
  });
});

describe('formatLexemeSample newFrom', () => {
  it('tags the examples from newFrom on as new', () => {
    const two = lexeme({
      examples: [
        { sentence: 'She ran to the bus.', clozeTarget: 'ran', translation: {} },
        { sentence: 'We run every day.', clozeTarget: 'run', translation: {} },
      ],
    });
    const out = formatLexemeSample(two, { newFrom: 1 }).split('\n');
    expect(out).toContain('  ex  She [ran] to the bus.');
    expect(out).toContain('  ex+ We [run] every day.');
  });
});
