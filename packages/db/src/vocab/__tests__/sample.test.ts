import { describe, expect, it } from 'vitest';
import { formatLexemeSample, highlightCloze, pickSample, type SampleLexeme } from '../sample';

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
