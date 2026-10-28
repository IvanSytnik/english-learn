import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auth,
  getPublishedPracticeItem,
  recordOutcome,
  loadNextExercise,
  getAttemptEvents,
  getNativeLanguage,
  getLocale,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  getPublishedPracticeItem: vi.fn(),
  recordOutcome: vi.fn(),
  loadNextExercise: vi.fn(),
  getAttemptEvents: vi.fn(),
  getNativeLanguage: vi.fn(),
  getLocale: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@englishlearn/db/queries/learner-activity', () => ({ getAttemptEvents }));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/learner', () => ({ learnerService: { recordOutcome } }));
vi.mock('@/lib/exercise/load', () => ({ loadNextExercise }));
vi.mock('@englishlearn/db/queries/exercises', () => ({ getPublishedPracticeItem }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('next-intl/server', () => ({ getLocale }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { nextExercise, submitExerciseAttempt, weekRhythm } = await import(
  '@/app/[locale]/(student)/exercises/actions'
);
const { encryptItemRef, ITEM_REF_TTL_MS } = await import('@/lib/crypto/item-ref');

const refFor = (itemId: string, userId = 'user_1', nowMs?: number) =>
  encryptItemRef({ itemId, userId }, nowMs);

const item = {
  id: 'item.past_simple.irregular_v2',
  kind: 'GRAMMAR_PATTERN',
  content: {
    source: { pattern: 'go → went', example: 'We went.' },
    localized: {
      explanation: {
        en: 'Irregular past.',
        ru: 'Неправильный глагол.',
        uk: 'Неправильне дієслово.',
      },
    },
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

/** What the player echoes back for `item`: issued to user_1. */
const REF = await refFor(item.id);

const recorded = (over = {}) => ({
  ok: true,
  duplicate: false,
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
  getLocale.mockResolvedValue('ru');
  // Not chosen: the "why" follows the interface locale, as before the choice existed.
  getNativeLanguage.mockResolvedValue(null);
});

describe('submitExerciseAttempt', () => {
  it('rejects anonymous callers without touching the learner model', async () => {
    auth.mockResolvedValue(null);
    const res = await submitExerciseAttempt({ itemRef: REF, answer: { type: 'dontKnow' } });
    expect(res).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it('rejects malformed input', async () => {
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 9 },
    });
    expect(res).toEqual({ ok: false, error: 'INVALID' });
  });

  it('rejects a forged, foreign or expired item reference without recording (S1)', async () => {
    for (const itemRef of [
      // The raw id: a client that knows or guesses it gets nothing.
      item.id,
      'not-a-token',
      // A real reference for the same item, issued to another learner.
      await refFor(item.id, 'user_2'),
      // Issued to this learner more than 24 h ago.
      await refFor(item.id, 'user_1', Date.now() - ITEM_REF_TTL_MS - 1),
    ]) {
      const res = await submitExerciseAttempt({ itemRef, answer: { type: 'choice', index: 3 } });
      expect(res, itemRef).toEqual({ ok: false, error: 'INVALID' });
    }
    expect(getPublishedPracticeItem).not.toHaveBeenCalled();
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for an unpublished or practice-less item', async () => {
    getPublishedPracticeItem.mockResolvedValue(null);
    const res = await submitExerciseAttempt({
      itemRef: await refFor('x'),
      answer: { type: 'dontKnow' },
    });
    expect(res).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('grades on the server and records through recordOutcome', async () => {
    const res = await submitExerciseAttempt({
      itemRef: REF,
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

  it('reports the review even when the stage crossing takes the consequence line', async () => {
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
    });
    expect(res.ok && res.value.consequence.kind).toBe('stageCrossed');
    expect(res.ok && res.value.review).toEqual({ kind: 'backInDays', days: 3 });
  });

  it("records I don't know as dontKnow, not as a chosen answer", async () => {
    recordOutcome.mockResolvedValue(recorded({ stageBefore: 'SOLID', scheduledDays: 0 }));
    const res = await submitExerciseAttempt({ itemRef: REF, answer: { type: 'dontKnow' } });
    expect(recordOutcome).toHaveBeenCalledWith({
      userId: 'user_1',
      itemId: item.id,
      dontKnow: true,
      timeMs: undefined,
    });
    expect(res.ok && res.value.verdict).toBe('dontKnow');
    expect(res.ok && res.value.consequence).toEqual({ kind: 'backSoon' });
    expect(res.ok && res.value.review).toEqual({ kind: 'backSoon' });
  });

  it('a wrong choice is recorded as incorrect', async () => {
    await submitExerciseAttempt({ itemRef: REF, answer: { type: 'choice', index: 0 } });
    expect(recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});

describe('submitExerciseAttempt: the hint (§8 #11)', () => {
  it('passes hinted to recordOutcome and announces no stage for a hinted answer', async () => {
    // A bootstrapped concept: the first (hinted) answer lifts the stored stage
    // to the prior's DEVELOPING while pKnown stays where it was.
    recordOutcome.mockResolvedValue(
      recorded({
        rating: 'HARD',
        pKnownBefore: 0.6,
        pKnownAfter: 0.6,
        stageBefore: 'NOT_STARTED',
        stageAfter: 'DEVELOPING',
        scheduledDays: 0,
        cardStatus: 'LEARNING',
      }),
    );
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      hinted: true,
    });
    expect(recordOutcome).toHaveBeenCalledWith({
      userId: 'user_1',
      itemId: item.id,
      correct: true,
      timeMs: undefined,
      hinted: true,
    });
    expect(res.ok && res.value.verdict).toBe('correct');
    expect(res.ok && res.value.consequence).toEqual({ kind: 'backSoon' });
  });

  it("passes the hint next to I don't know", async () => {
    await submitExerciseAttempt({ itemRef: REF, answer: { type: 'dontKnow' }, hinted: true });
    expect(recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ dontKnow: true, hinted: true }),
    );
  });

  it('rejects a non-boolean hinted without recording', async () => {
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      hinted: 'yes' as unknown as boolean,
    });
    expect(res).toEqual({ ok: false, error: 'INVALID' });
    expect(recordOutcome).not.toHaveBeenCalled();
  });
});

describe('submitExerciseAttempt: the language of the "why"', () => {
  const submit = () =>
    submitExerciseAttempt({ itemRef: REF, answer: { type: 'choice', index: 3 } });

  it("follows the learner's native language; the consequence line stays in the UI locale", async () => {
    getLocale.mockResolvedValue('en');
    getNativeLanguage.mockResolvedValue('uk');
    const res = await submit();
    expect(getNativeLanguage).toHaveBeenCalledWith(expect.anything(), 'user_1');
    expect(res.ok && res.value.why).toBe('Неправильне дієслово.');
    expect(res.ok && res.value.consequence).toMatchObject({ concept: 'Past Simple' });
  });

  it('"other" → English, even on a Russian interface', async () => {
    getNativeLanguage.mockResolvedValue('other');
    const res = await submit();
    expect(res.ok && res.value.why).toBe('Irregular past.');
    expect(res.ok && res.value.consequence).toMatchObject({
      concept: 'Past Simple (простое прошедшее время)',
    });
  });

  it('a stored value outside the list → the interface locale', async () => {
    getNativeLanguage.mockResolvedValue('pl');
    const res = await submit();
    expect(res.ok && res.value.why).toBe('Неправильный глагол.');
  });
});

describe('submitExerciseAttempt: the attempt key (idempotency)', () => {
  const KEY = '3f1c2b9e-7d4a-4e6f-9a1b-2c3d4e5f6a7b';
  /** recordOutcome found the key already recorded: nothing new was written. */
  const duplicate = (original: { correct: boolean; dontKnow?: boolean; hinted?: boolean }) =>
    recorded({
      duplicate: true,
      original: { dontKnow: false, hinted: false, ...original },
      pKnownBefore: 0.75,
      pKnownAfter: 0.75,
      stageBefore: 'SOLID',
      stageAfter: 'SOLID',
    });

  it('passes the attempt key to recordOutcome as the idempotency key', async () => {
    await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: KEY,
    });
    expect(recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, idempotencyKey: KEY }),
    );
  });

  it('without a key records with none (a page loaded before the field existed)', async () => {
    await submitExerciseAttempt({ itemRef: REF, answer: { type: 'choice', index: 3 } });
    expect(recordOutcome.mock.calls[0]?.[0].idempotencyKey).toBeUndefined();
  });

  it('rejects a key that is not a UUID without recording', async () => {
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: 'not-a-uuid',
    });
    expect(res).toEqual({ ok: false, error: 'INVALID' });
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it('a key reused for another item is INVALID', async () => {
    recordOutcome.mockResolvedValue({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: KEY,
    });
    expect(res).toEqual({ ok: false, error: 'INVALID' });
  });

  it('a resend reports the recorded verdict, not its own answer', async () => {
    // Recorded wrong; the resend picks the right option after the reply was lost.
    recordOutcome.mockResolvedValue(duplicate({ correct: false }));
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: KEY,
    });
    expect(res.ok && res.value).toMatchObject({
      verdict: 'incorrect',
      // The resend's option is not the recorded one: not marked as picked.
      chosenIndex: null,
      correctIndex: 3,
      correctAnswer: 'went',
      why: 'Неправильный глагол.',
      // No stage crossing is announced twice — only the review line.
      consequence: { kind: 'backInDays', days: 3 },
    });
  });

  it('a resend of the same answer keeps its option marked', async () => {
    recordOutcome.mockResolvedValue(duplicate({ correct: false }));
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 0 },
      attemptKey: KEY,
    });
    expect(res.ok && res.value).toMatchObject({ verdict: 'incorrect', chosenIndex: 0 });
  });

  it("a recorded I don't know stays I don't know", async () => {
    recordOutcome.mockResolvedValue(duplicate({ correct: false, dontKnow: true }));
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: KEY,
    });
    expect(res.ok && res.value).toMatchObject({ verdict: 'dontKnow', chosenIndex: null });
  });

  it('the recorded hint decides the consequence line', async () => {
    recordOutcome.mockResolvedValue(
      recorded({
        duplicate: true,
        original: { correct: true, dontKnow: false, hinted: true },
        stageBefore: 'DEVELOPING',
        stageAfter: 'SOLID',
        scheduledDays: 0,
      }),
    );
    const res = await submitExerciseAttempt({
      itemRef: REF,
      answer: { type: 'choice', index: 3 },
      attemptKey: KEY,
    });
    // Even with a crossing in the numbers, a hinted answer announces none.
    expect(res.ok && res.value.consequence).toEqual({ kind: 'backSoon' });
  });
});

describe('nextExercise', () => {
  it('passes only the last few recent items as exclusions', async () => {
    loadNextExercise.mockResolvedValue(null);
    const refs = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => refFor(id)));
    const res = await nextExercise(refs);
    expect(res).toEqual({ ok: true, value: null });
    expect(loadNextExercise).toHaveBeenCalledWith({
      userId: 'user_1',
      locale: 'ru',
      excludeItemIds: ['c', 'd', 'e'],
    });
  });

  it("drops recent references that are not this learner's, instead of failing", async () => {
    loadNextExercise.mockResolvedValue(null);
    const refs = [
      await refFor('mine'),
      await refFor('theirs', 'user_2'),
      'item.vocab.travel.luggage',
    ];
    expect(await nextExercise(refs)).toEqual({ ok: true, value: null });
    expect(loadNextExercise).toHaveBeenCalledWith(
      expect.objectContaining({ excludeItemIds: ['mine'] }),
    );
  });

  it('rejects anonymous callers', async () => {
    auth.mockResolvedValue(null);
    expect(await nextExercise([])).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });
});

describe('weekRhythm', () => {
  // Five answers at Tue 2026-10-20 00:30 in Vienna (= Mon 22:30 UTC).
  const tuesdayInVienna = Array.from({ length: 5 }, (_, i) => ({
    type: 'ITEM_ATTEMPTED',
    occurredAt: Date.parse('2026-10-19T22:30:00Z') + i * 1000,
  }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    getAttemptEvents.mockResolvedValue(tuesdayInVienna);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects anonymous callers without reading events', async () => {
    auth.mockResolvedValue(null);
    expect(await weekRhythm('Europe/Vienna')).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(getAttemptEvents).not.toHaveBeenCalled();
  });

  it("reads only the caller's events, in a window covering the week", async () => {
    await weekRhythm('Europe/Vienna');
    const now = Date.parse('2026-10-21T10:00:00Z');
    expect(getAttemptEvents).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_1',
      fromMs: now - 8 * 86_400_000,
      toMs: now,
    });
  });

  it("counts days in the client's time zone", async () => {
    const res = await weekRhythm('Europe/Vienna');
    expect(res.ok && res.value.timeZone).toBe('Europe/Vienna');
    expect(res.ok && res.value.days.filter((d) => d.counted).map((d) => d.date)).toEqual([
      '2026-10-20',
    ]);
  });

  it('logs a failed read on the server and returns UNAVAILABLE instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('connection reset');
    getAttemptEvents.mockRejectedValue(boom);
    expect(await weekRhythm('Europe/Vienna')).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(error).toHaveBeenCalledWith('weekRhythm failed', boom);
    error.mockRestore();
  });

  it('treats an invalid time zone as UTC instead of trusting it', async () => {
    for (const tz of ['Not/AZone', 42, { toString: () => 'Europe/Vienna' }]) {
      const res = await weekRhythm(tz);
      expect(res.ok && res.value.timeZone).toBe('UTC');
      expect(res.ok && res.value.days.filter((d) => d.counted).map((d) => d.date)).toEqual([
        '2026-10-19',
      ]);
    }
  });
});
