import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auth,
  getLocale,
  nextVocab,
  recordVocabOutcome,
  getVocabPool,
  getNativeLanguage,
  hasItemReviewState,
  setDailyVocabLimit,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  getLocale: vi.fn(),
  nextVocab: vi.fn(),
  recordVocabOutcome: vi.fn(),
  getVocabPool: vi.fn(),
  getNativeLanguage: vi.fn(),
  hasItemReviewState: vi.fn(),
  setDailyVocabLimit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({
  hasItemReviewState,
  setDailyVocabLimit,
}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('next-intl/server', () => ({ getLocale }));
vi.mock('@/lib/learner', () => ({
  learnerService: { recordVocabOutcome },
  vocabSessionService: { nextVocab },
}));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const {
  nextVocabCardAction,
  startVocabProofAction,
  submitVocabAttemptAction,
  updateDailyVocabLimitAction,
} = await import('@/app/[locale]/(student)/actions/vocab');
const { decryptVocabRef, encryptVocabRef } = await import('@/lib/crypto/vocab-ref');

const USER = 'user_1';
const CONCEPT = 'vocab.food_drink.a1';
const word = (lemma: string, ru: string) => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos: 'NOUN' as const,
  cefrLevel: 'A1' as const,
  conceptId: CONCEPT,
  ipa: null,
  definitions: { en: `a kind of ${lemma}` },
  translations: { ru },
  examples: [{ sentence: `The ${lemma} is good.`, translation: { ru: 'x' }, clozeTarget: lemma }],
  variants: [],
});
const LEXEMES = [
  word('apple', 'яблоко'),
  word('bread', 'хлеб'),
  word('cheese', 'сыр'),
  word('milk', 'молоко'),
  word('honey', 'мёд'),
];
const APPLE = 'item-apple';

const selection = (over = {}) => ({
  ok: true,
  itemId: APPLE,
  reason: 'NEW',
  mode: 'en_to_l1',
  lastReviewAt: null,
  remainingNew: 9,
  ...over,
});

/** The write path's idempotency, as recordVocabOutcome keeps it: one outcome per key. */
let byKey: Map<string, { correct: boolean; dontKnow: boolean; hinted: boolean }>;
function idempotentRecord(input: {
  idempotencyKey?: string;
  correct?: boolean;
  dontKnow?: boolean;
}) {
  const base = {
    ok: true,
    occurredAt: 1n,
    rating: input.correct ? 'GOOD' : 'AGAIN',
    conceptId: CONCEPT,
    pKnownBefore: 0.3,
    pKnownAfter: 0.4,
    nextDueAt: 2n,
    scheduledDays: 0,
    cardStatus: 'LEARNING',
    stageBefore: 'NOT_STARTED',
    stageAfter: 'NOT_STARTED',
  };
  const key = input.idempotencyKey;
  const original = key ? byKey.get(key) : undefined;
  if (original) return Promise.resolve({ ...base, duplicate: true, original });
  if (key) {
    byKey.set(key, {
      correct: input.correct === true,
      dontKnow: input.dontKnow === true,
      hinted: false,
    });
  }
  return Promise.resolve({ ...base, duplicate: false });
}

async function servedRef(over = {}) {
  nextVocab.mockResolvedValueOnce(selection(over));
  const out = await nextVocabCardAction({ timeZone: 'Europe/Berlin' });
  if (!out.ok || out.value.status !== 'card') throw new Error('expected a card');
  return out.value.vocabRef;
}

beforeEach(() => {
  vi.clearAllMocks();
  byKey = new Map();
  auth.mockResolvedValue({ user: { id: USER, role: 'STUDENT' } });
  getLocale.mockResolvedValue('ru');
  getNativeLanguage.mockResolvedValue('ru');
  getVocabPool.mockResolvedValue({
    lexemes: LEXEMES,
    byItemId: new Map(LEXEMES.map((l) => [l.itemId, l])),
  });
  hasItemReviewState.mockResolvedValue(false);
  nextVocab.mockResolvedValue(selection());
  recordVocabOutcome.mockImplementation(idempotentRecord);
  setDailyVocabLimit.mockResolvedValue(undefined);
});

describe('only learners (S5)', () => {
  const calls = (vocabRef: string) => [
    () => nextVocabCardAction({}),
    () => startVocabProofAction({ vocabRef }),
    () => submitVocabAttemptAction({ vocabRef, answer: { type: 'dontKnow' } }),
    () => updateDailyVocabLimitAction({ dailyVocabLimit: 20 }),
  ];

  it.each([
    ['no session', null, 'UNAUTHENTICATED'],
    ['a session without a user', {}, 'UNAUTHENTICATED'],
    ['a TUTOR', { user: { id: USER, role: 'TUTOR' } }, 'FORBIDDEN'],
    ['an ADMIN', { user: { id: USER, role: 'ADMIN' } }, 'FORBIDDEN'],
    ['a session without a role', { user: { id: USER } }, 'FORBIDDEN'],
  ])('%s is refused by every action, nothing read or written', async (_, session, error) => {
    const vocabRef = await servedRef();
    vi.clearAllMocks();
    auth.mockResolvedValue(session);
    for (const call of calls(vocabRef)) {
      expect(await call()).toEqual({ ok: false, error });
    }
    expect(nextVocab).not.toHaveBeenCalled();
    expect(getVocabPool).not.toHaveBeenCalled();
    expect(hasItemReviewState).not.toHaveBeenCalled();
    expect(recordVocabOutcome).not.toHaveBeenCalled();
    expect(setDailyVocabLimit).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it.each([
    ['a non-topic conceptId', { conceptId: 'grammar.past_simple' }],
    ['an unknown topic', { conceptId: 'vocab.cooking.a1' }],
    ['too many recent refs', { recentVocabRefs: Array(21).fill('x') }],
    ['an oversized ref', { recentVocabRefs: ['x'.repeat(1025)] }],
    ['a non-string time zone', { timeZone: 42 }],
  ])('nextVocabCardAction refuses %s', async (_, input) => {
    expect(await nextVocabCardAction(input as never)).toEqual({ ok: false, error: 'INVALID' });
    expect(nextVocab).not.toHaveBeenCalled();
  });

  it.each([
    ['no answer', {}],
    ['an index out of range', { answer: { type: 'choice', index: 4 } }],
    ['a fractional index', { answer: { type: 'choice', index: 1.5 } }],
    ['an oversized text', { answer: { type: 'text', value: 'a'.repeat(201) } }],
    ['an unknown answer type', { answer: { type: 'guess' } }],
    ['a non-uuid attempt key', { answer: { type: 'dontKnow' }, attemptKey: 'k1' }],
    ['an implausible time', { answer: { type: 'dontKnow' }, timeMs: 3_600_001 }],
    ['an empty ref', { vocabRef: '', answer: { type: 'dontKnow' } }],
  ])('submitVocabAttemptAction refuses %s', async (_, over) => {
    const vocabRef = await servedRef();
    expect(await submitVocabAttemptAction({ vocabRef, ...over } as never)).toEqual({
      ok: false,
      error: 'INVALID',
    });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it.each([0, 51, 10.5, '20', null])('updateDailyVocabLimitAction refuses %s', async (value) => {
    expect(await updateDailyVocabLimitAction({ dailyVocabLimit: value } as never)).toEqual({
      ok: false,
      error: 'INVALID',
    });
    expect(setDailyVocabLimit).not.toHaveBeenCalled();
  });
});

describe('nextVocabCardAction', () => {
  it('serves a card for a topic, skipping the words of recent refs', async () => {
    const recent = await servedRef({ itemId: 'item-bread' });
    const foreign = await encryptVocabRef({
      userId: 'user_2',
      itemId: 'item-cheese',
      mode: 'en_to_l1',
      isProof: false,
      lastReviewAt: null,
      locale: 'ru',
      correctIndex: 0,
    });
    const out = await nextVocabCardAction({
      conceptId: CONCEPT,
      recentVocabRefs: [foreign, 'garbage', recent],
      timeZone: 'Europe/Berlin',
    });

    expect(out).toMatchObject({ ok: true, value: { status: 'card', card: { word: 'apple' } } });
    // Only this learner's decryptable refs steer selection.
    expect(nextVocab).toHaveBeenLastCalledWith({
      userId: USER,
      timeZone: 'Europe/Berlin',
      conceptId: CONCEPT,
      excludeItemIds: ['item-bread'],
    });
  });

  it('an unexpected failure is UNAVAILABLE, logged on the server', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    nextVocab.mockRejectedValueOnce(new Error('db down'));
    expect(await nextVocabCardAction({})).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('submitVocabAttemptAction', () => {
  it('records once per attempt key: a resend replays the recorded verdict', async () => {
    const vocabRef = await servedRef();
    const ref = await decryptVocabRef(vocabRef, USER);
    if (!ref.ok || ref.value.correctIndex === null) throw new Error('ref');
    const right = ref.value.correctIndex;
    const attemptKey = crypto.randomUUID();

    const first = await submitVocabAttemptAction({
      vocabRef,
      answer: { type: 'choice', index: right },
      attemptKey,
    });
    // The reply was lost; the client resends — even with another option picked.
    const resend = await submitVocabAttemptAction({
      vocabRef,
      answer: { type: 'choice', index: (right + 1) % 4 },
      attemptKey,
    });

    expect(first).toMatchObject({
      ok: true,
      value: { status: 'answered', verdict: 'correct', chosenIndex: right },
    });
    expect(resend).toMatchObject({
      ok: true,
      value: { status: 'answered', verdict: 'correct', chosenIndex: null },
    });
    expect(recordVocabOutcome).toHaveBeenCalledTimes(2);
    for (const [input] of recordVocabOutcome.mock.calls) {
      expect(input).toMatchObject({ idempotencyKey: attemptKey, expectedLastReviewAt: null });
    }
    expect(byKey.size).toBe(1);
  });

  it('a forged ref is INVALID and records nothing', async () => {
    expect(
      await submitVocabAttemptAction({ vocabRef: 'forged', answer: { type: 'dontKnow' } }),
    ).toEqual({ ok: false, error: 'INVALID' });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('STALE from the write path reaches the client as stale', async () => {
    const vocabRef = await servedRef();
    recordVocabOutcome.mockResolvedValueOnce({ ok: false, error: 'STALE' });
    expect(await submitVocabAttemptAction({ vocabRef, answer: { type: 'dontKnow' } })).toEqual({
      ok: true,
      value: { status: 'stale' },
    });
  });
});

describe('startVocabProofAction', () => {
  it('returns a proof card for a new word', async () => {
    const vocabRef = await servedRef();
    const out = await startVocabProofAction({ vocabRef });
    expect(out).toMatchObject({
      ok: true,
      value: { isProof: true, card: { mode: 'cued_recall', gloss: 'яблоко' } },
    });
  });
});

describe('updateDailyVocabLimitAction', () => {
  it('stores the limit for the signed-in learner only', async () => {
    expect(await updateDailyVocabLimitAction({ dailyVocabLimit: 25 })).toEqual({
      ok: true,
      value: { dailyVocabLimit: 25 },
    });
    expect(setDailyVocabLimit).toHaveBeenCalledExactlyOnceWith({ tag: 'prisma' }, USER, 25);
  });

  it('a database failure is UNAVAILABLE', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setDailyVocabLimit.mockRejectedValueOnce(new Error('check violated'));
    expect(await updateDailyVocabLimitAction({ dailyVocabLimit: 25 })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    error.mockRestore();
  });
});
