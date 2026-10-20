import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, getPublishedPracticeItem, recordOutcome, loadNextExercise } = vi.hoisted(() => ({
  auth: vi.fn(),
  getPublishedPracticeItem: vi.fn(),
  recordOutcome: vi.fn(),
  loadNextExercise: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/learner', () => ({ learnerService: { recordOutcome } }));
vi.mock('@/lib/exercise/load', () => ({ loadNextExercise }));
vi.mock('@englishlearn/db/queries/exercises', () => ({ getPublishedPracticeItem }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'ru' }));

const { nextExercise, submitExerciseAttempt } = await import(
  '@/app/[locale]/(student)/exercises/actions'
);

const item = {
  id: 'item.past_simple.irregular_v2',
  kind: 'GRAMMAR_PATTERN',
  content: {
    source: { pattern: 'go → went', example: 'We went.' },
    localized: { explanation: { en: 'Irregular past.', ru: 'Неправильный глагол.' } },
  },
  practice: {
    type: 'choice',
    prompt: 'Last summer we ___ to Spain.',
    options: ['goed', 'gone', 'go', 'went'],
    correctIndex: 3,
  },
  concept: {
    id: 'grammar.past_simple',
    name: 'Past Simple',
    title: { en: 'Past Simple', ru: 'Past Simple (простое прошедшее время)' },
    cefrLevel: 'A2',
  },
};

const recorded = (over = {}) => ({
  ok: true,
  occurredAt: 1n,
  rating: 'GOOD',
  conceptId: 'grammar.past_simple',
  pKnownBefore: 0.6,
  pKnownAfter: 0.75,
  nextDueAt: 2n,
  scheduledDays: 3,
  cardStatus: 'REVIEW',
  stageBefore: 'DEVELOPING',
  stageAfter: 'SOLID',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user_1' } });
  getPublishedPracticeItem.mockResolvedValue(item);
  recordOutcome.mockResolvedValue(recorded());
});

describe('submitExerciseAttempt', () => {
  it('rejects anonymous callers without touching the learner model', async () => {
    auth.mockResolvedValue(null);
    const res = await submitExerciseAttempt({ itemId: item.id, answer: { type: 'dontKnow' } });
    expect(res).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it('rejects malformed input', async () => {
    const res = await submitExerciseAttempt({
      itemId: item.id,
      answer: { type: 'choice', index: 9 },
    });
    expect(res).toEqual({ ok: false, error: 'INVALID' });
  });

  it('returns NOT_FOUND for an unpublished or practice-less item', async () => {
    getPublishedPracticeItem.mockResolvedValue(null);
    const res = await submitExerciseAttempt({ itemId: 'x', answer: { type: 'dontKnow' } });
    expect(res).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('grades on the server and records through recordOutcome', async () => {
    const res = await submitExerciseAttempt({
      itemId: item.id,
      answer: { type: 'choice', index: 3 },
      timeMs: 4200,
    });
    expect(recordOutcome).toHaveBeenCalledWith({
      userId: 'user_1',
      itemId: item.id,
      correct: true,
      timeMs: 4200,
    });
    expect(res.ok && res.value).toMatchObject({
      verdict: 'correct',
      chosenIndex: 3,
      correctIndex: 3,
      correctAnswer: 'went',
      answerSentence: 'Last summer we went to Spain.',
      why: 'Неправильный глагол.',
      consequence: {
        kind: 'stageCrossed',
        concept: 'Past Simple (простое прошедшее время)',
        stage: 'SOLID',
      },
    });
  });

  it("records I don't know as dontKnow, not as a chosen answer", async () => {
    recordOutcome.mockResolvedValue(recorded({ stageBefore: 'SOLID', scheduledDays: 0 }));
    const res = await submitExerciseAttempt({ itemId: item.id, answer: { type: 'dontKnow' } });
    expect(recordOutcome).toHaveBeenCalledWith({
      userId: 'user_1',
      itemId: item.id,
      dontKnow: true,
      timeMs: undefined,
    });
    expect(res.ok && res.value.verdict).toBe('dontKnow');
    expect(res.ok && res.value.consequence).toEqual({ kind: 'backSoon' });
  });

  it('a wrong choice is recorded as incorrect', async () => {
    await submitExerciseAttempt({ itemId: item.id, answer: { type: 'choice', index: 0 } });
    expect(recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});

describe('nextExercise', () => {
  it('passes only the last few recent items as exclusions', async () => {
    loadNextExercise.mockResolvedValue(null);
    const res = await nextExercise(['a', 'b', 'c', 'd', 'e']);
    expect(res).toEqual({ ok: true, value: null });
    expect(loadNextExercise).toHaveBeenCalledWith({
      userId: 'user_1',
      locale: 'ru',
      excludeItemIds: ['c', 'd', 'e'],
    });
  });

  it('rejects anonymous callers', async () => {
    auth.mockResolvedValue(null);
    expect(await nextExercise([])).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });
});
