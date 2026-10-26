import type { ItemContent, Practice } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import {
  consequenceFor,
  contentLocale,
  daysSince,
  explanationFor,
  fillGap,
  gradeAnswer,
  hintFor,
  parseSessionMinutes,
  reasonDetail,
  reviewFor,
  SESSION_ITEMS,
  stageCrossing,
  toQuestion,
} from '@/lib/exercise/view';

const choice: Practice = {
  type: 'choice',
  prompt: 'Last summer we ___ to Spain.',
  options: ['goed', 'gone', 'go', 'went'],
  correctIndex: 3,
};
const cloze: Practice = {
  type: 'cloze',
  prompt: 'There are three ___ on the shelf. (box)',
  acceptedAnswers: ['boxes'],
};

describe('toQuestion', () => {
  it('never leaks the answer key to the client', () => {
    expect(toQuestion(choice)).toEqual({
      type: 'choice',
      prompt: choice.prompt,
      options: ['goed', 'gone', 'go', 'went'],
    });
    expect(toQuestion(cloze)).toEqual({ type: 'cloze', prompt: cloze.prompt });
    expect(JSON.stringify(toQuestion(choice))).not.toContain('correctIndex');
    expect(JSON.stringify(toQuestion(cloze))).not.toContain('boxes');
  });
});

describe('gradeAnswer', () => {
  it('grades choice by index and cloze by normalized text', () => {
    expect(gradeAnswer(choice, { type: 'choice', index: 3 })).toBe('correct');
    expect(gradeAnswer(choice, { type: 'choice', index: 0 })).toBe('incorrect');
    expect(gradeAnswer(cloze, { type: 'text', value: '  Boxes ' })).toBe('correct');
    expect(gradeAnswer(cloze, { type: 'text', value: 'boxs' })).toBe('incorrect');
  });

  it('treats a mismatched answer shape as incorrect, never correct', () => {
    expect(gradeAnswer(choice, { type: 'text', value: 'went' })).toBe('incorrect');
    expect(gradeAnswer(cloze, { type: 'choice', index: 0 })).toBe('incorrect');
    expect(gradeAnswer(cloze, { type: 'text', value: '' })).toBe('incorrect');
  });

  it("returns dontKnow for an explicit I don't know", () => {
    expect(gradeAnswer(choice, { type: 'dontKnow' })).toBe('dontKnow');
  });
});

describe('fillGap', () => {
  it('fills the gap and tidies the zero article', () => {
    expect(fillGap(choice.prompt, 'went')).toBe('Last summer we went to Spain.');
    expect(fillGap('In general, ___ dogs are loyal animals.', '—')).toBe(
      'In general, dogs are loyal animals.',
    );
    expect(fillGap('___ she work here?', 'Does')).toBe('Does she work here?');
  });
});

describe('reasonDetail', () => {
  const now = 10 * 86_400_000;
  it('new concepts show what unlocked them; started ones show days since practice', () => {
    expect(
      reasonDetail({
        isNewConcept: true,
        unlockedByTitles: ['Past Simple'],
        lastPracticedAt: null,
        now,
      }),
    ).toEqual({ kind: 'unlockedBy', concepts: ['Past Simple'] });
    expect(
      reasonDetail({ isNewConcept: true, unlockedByTitles: [], lastPracticedAt: null, now }),
    ).toBeNull();
    expect(
      reasonDetail({
        isNewConcept: false,
        unlockedByTitles: [],
        lastPracticedAt: now - 6 * 86_400_000,
        now,
      }),
    ).toEqual({ kind: 'lastPractised', days: 6 });
  });

  it('daysSince never goes negative', () => {
    expect(daysSince(now + 1000, now)).toBe(0);
  });
});

describe('consequenceFor', () => {
  const base = { conceptTitle: 'Past Simple', scheduledDays: 3 };
  it('prioritises a stage crossing, then Back soon, then Back in N days', () => {
    expect(consequenceFor({ ...base, stageBefore: 'DEVELOPING', stageAfter: 'SOLID' })).toEqual({
      kind: 'stageCrossed',
      concept: 'Past Simple',
      stage: 'SOLID',
    });
    expect(
      consequenceFor({ ...base, stageBefore: 'SOLID', stageAfter: 'SOLID', scheduledDays: 0 }),
    ).toEqual({ kind: 'backSoon' });
    expect(consequenceFor({ ...base, stageBefore: 'SOLID', stageAfter: 'SOLID' })).toEqual({
      kind: 'backInDays',
      days: 3,
    });
  });
});

describe('consequenceFor — hinted (§8 #11)', () => {
  const base = { conceptTitle: 'Past Simple', scheduledDays: 3, hinted: true };
  it('a bootstrapped concept lifted to Developing by a hinted answer shows the review, not a stage', () => {
    expect(
      consequenceFor({ ...base, stageBefore: 'NOT_STARTED', stageAfter: 'DEVELOPING' }),
    ).toEqual({ kind: 'backInDays', days: 3 });
    expect(
      consequenceFor({
        ...base,
        stageBefore: 'NOT_STARTED',
        stageAfter: 'DEVELOPING',
        scheduledDays: 0,
      }),
    ).toEqual({ kind: 'backSoon' });
  });

  it('without the hint the same crossing is still announced', () => {
    expect(
      consequenceFor({
        ...base,
        hinted: false,
        stageBefore: 'NOT_STARTED',
        stageAfter: 'DEVELOPING',
      }),
    ).toEqual({ kind: 'stageCrossed', concept: 'Past Simple', stage: 'DEVELOPING' });
  });
});

describe('reviewFor', () => {
  it('a learning step is Back soon, never "in 0 days"; otherwise whole days', () => {
    expect(reviewFor(0)).toEqual({ kind: 'backSoon' });
    expect(reviewFor(-1)).toEqual({ kind: 'backSoon' });
    expect(reviewFor(2.6)).toEqual({ kind: 'backInDays', days: 3 });
  });
});

describe('stageCrossing', () => {
  it('announces real progress only, from Developing up', () => {
    expect(stageCrossing('NOT_STARTED', 'EMERGING')).toBeNull();
    expect(stageCrossing('EMERGING', 'DEVELOPING')).toBe('DEVELOPING');
    expect(stageCrossing('SOLID', 'DEVELOPING')).toBeNull();
    // HIGH_SOLID is still shown as Solid mid-session (Secure needs FSRS stability).
    expect(stageCrossing('SOLID', 'HIGH_SOLID')).toBeNull();
    expect(stageCrossing('DEVELOPING', 'HIGH_SOLID')).toBe('SOLID');
  });
});

describe('hintFor / explanationFor', () => {
  const grammar = {
    source: { pattern: 'have/has + V3', example: 'She has finished.' },
    localized: {
      explanation: { en: 'Use have/has with V3.', ru: 'have/has + V3.' },
      usageNote: { en: 'Not with finished time.' },
    },
  } as ItemContent;
  const vocab = {
    source: { headword: 'luggage' },
    localized: { translation: { en: 'bags', ru: 'багаж' }, definition: { en: 'Bags for travel.' } },
  } as ItemContent;

  it('gives the rule formula for grammar and the meaning for vocabulary', () => {
    expect(hintFor('GRAMMAR_PATTERN', grammar, 'ru')).toBe('have/has + V3');
    expect(hintFor('VOCAB_WORD', vocab, 'ru')).toBe('багаж');
  });

  it('localizes the why, falling back to English', () => {
    expect(explanationFor('GRAMMAR_PATTERN', grammar, 'ru')).toEqual({
      why: 'have/has + V3.',
      more: 'Not with finished time.',
    });
    expect(explanationFor('VOCAB_WORD', vocab, 'de')).toEqual({
      why: 'luggage — bags',
      more: 'Bags for travel.',
    });
  });
});

describe('parseSessionMinutes', () => {
  it('accepts only the allowlisted lengths and maps them on the server', () => {
    expect(parseSessionMinutes('5')).toBe(5);
    expect(parseSessionMinutes('10')).toBe(10);
    expect(parseSessionMinutes('20')).toBe(20);
    expect(SESSION_ITEMS).toEqual({ 5: 6, 10: 12, 20: 24 });
  });

  it('rejects anything else, so the client can never pick an arbitrary count', () => {
    for (const raw of ['', '7', '999', '0', '-5', '05', '10.0', ' 10', '1e1', 'ten', '24']) {
      expect(parseSessionMinutes(raw), JSON.stringify(raw)).toBeNull();
    }
    for (const raw of [undefined, null, 10, {}, true]) {
      expect(parseSessionMinutes(raw), String(raw)).toBeNull();
    }
  });

  it('rejects a repeated param (array) instead of taking its first element', () => {
    expect(parseSessionMinutes(['5', '10'])).toBeNull();
    expect(parseSessionMinutes(['10'])).toBeNull();
  });
});

describe('contentLocale (the language of the hint and the why)', () => {
  it('a chosen ru / uk / de wins over the interface locale', () => {
    expect(contentLocale('ru', 'en')).toBe('ru');
    expect(contentLocale('uk', 'ru')).toBe('uk');
    expect(contentLocale('de', 'uk')).toBe('de');
  });

  it('"other" means English, the source — never the interface locale', () => {
    for (const ui of ['en', 'ru', 'uk', 'de'] as const)
      expect(contentLocale('other', ui)).toBe('en');
  });

  it('not chosen, blank or outside the list → the interface locale, as before', () => {
    for (const stored of [null, '', ' ', 'pl', 'RU', 'en']) {
      expect(contentLocale(stored, 'uk'), String(stored)).toBe('uk');
    }
  });
});
