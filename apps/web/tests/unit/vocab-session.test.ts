import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextVocab, recordVocabOutcome, getVocabPool, getNativeLanguage, hasItemReviewState } =
  vi.hoisted(() => ({
    nextVocab: vi.fn(),
    recordVocabOutcome: vi.fn(),
    getVocabPool: vi.fn(),
    getNativeLanguage: vi.fn(),
    hasItemReviewState: vi.fn(),
  }));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState }));
vi.mock('@/lib/learner', () => ({
  learnerService: { recordVocabOutcome },
  vocabSessionService: { nextVocab },
}));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { loadNextVocabCard, startVocabProof, submitVocabAttempt } = await import(
  '@/lib/vocab-session'
);
const { decryptVocabRef, encryptVocabRef } = await import('@/lib/crypto/vocab-ref');

const USER = 'user_1';
const CONCEPT = 'vocab.food_drink.a1';

/** A small published vocabulary: distinct glosses, one example each. */
const word = (lemma: string, ru: string, extra: Partial<{ variants: string[] }> = {}) => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos: 'NOUN' as const,
  cefrLevel: 'A1' as const,
  conceptId: CONCEPT,
  ipa: lemma,
  definitions: { en: `a kind of ${lemma}` },
  translations: { ru, uk: `${ru}-uk`, de: `${ru}-de` },
  examples: [
    {
      sentence: `I like the ${lemma} a lot.`,
      translation: { ru: `пример ${ru}` },
      clozeTarget: lemma,
    },
  ],
  variants: extra.variants ?? [],
});
const LEXEMES = [
  word('apple', 'яблоко'),
  word('bread', 'хлеб'),
  word('cheese', 'сыр'),
  word('milk', 'молоко'),
  word('honey', 'мёд'),
  word('soup', 'суп'),
  // Same Russian gloss as `soup` would be: a synonym for cued recall.
  word('broth', 'бульон'),
  word('pasta', 'макароны', { variants: ['macaroni'] }),
];
const POOL = {
  lexemes: LEXEMES,
  byItemId: new Map(LEXEMES.map((l) => [l.itemId, l])),
  itemIdByLexemeId: new Map(LEXEMES.map((l) => [l.id, l.itemId])),
};
const APPLE = 'item-apple';

const selection = (over = {}) => ({
  ok: true,
  itemId: APPLE,
  reason: 'NEW',
  mode: 'en_to_l1',
  lastReviewAt: null,
  remainingNew: 7,
  ...over,
});
const recorded = (over = {}) => ({
  ok: true,
  duplicate: false,
  occurredAt: 10n,
  rating: 'GOOD',
  conceptId: CONCEPT,
  pKnownBefore: 0.3,
  pKnownAfter: 0.5,
  nextDueAt: 20n,
  scheduledDays: 0,
  cardStatus: 'LEARNING',
  stageBefore: 'NOT_STARTED',
  stageAfter: 'DEVELOPING',
  ...over,
});
const load = (over = {}) =>
  loadNextVocabCard({ userId: USER, uiLocale: 'en', timeZone: 'Europe/Berlin', ...over });

async function served(over = {}) {
  nextVocab.mockResolvedValueOnce(selection(over));
  const out = await load();
  if (!out.ok || out.value.status !== 'card') throw new Error('expected a card');
  return out.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  getVocabPool.mockResolvedValue(POOL);
  getNativeLanguage.mockResolvedValue('ru');
  hasItemReviewState.mockResolvedValue(false);
  nextVocab.mockResolvedValue(selection());
  recordVocabOutcome.mockResolvedValue(recorded());
});

/** Keys and values the client must never see before answering. */
function expectNoAnswerKey(payload: unknown, lemma?: string) {
  const json = JSON.stringify(payload);
  for (const key of [
    'itemId',
    'lexemeId',
    'correctIndex',
    'accepted',
    'synonyms',
    'stability',
    'optionItemIds',
    'optionLexemeIds',
  ]) {
    expect(json).not.toContain(`"${key}"`);
  }
  for (const l of LEXEMES) {
    expect(json).not.toContain(l.itemId);
    expect(json).not.toContain(l.id);
  }
  if (lemma) expect(json.toLowerCase()).not.toContain(lemma);
}

describe('loadNextVocabCard', () => {
  it('serves a client-safe card in the learner’s language with a sealed ref', async () => {
    const card = await served();
    expect(card).toMatchObject({ status: 'card', canProve: true, isProof: false, remainingNew: 7 });
    expect(card.card).toMatchObject({ mode: 'en_to_l1', word: 'apple', ipa: 'apple' });
    if (card.card.mode !== 'en_to_l1') throw new Error('mode');
    expect(card.card.options).toHaveLength(4);
    expect(card.card.options).toContain('яблоко');
    expectNoAnswerKey({ ...card, card: { ...card.card, word: null } });

    const ref = await decryptVocabRef(card.vocabRef, USER);
    if (!ref.ok) throw new Error('ref');
    expect(ref.value).toMatchObject({
      itemId: APPLE,
      mode: 'en_to_l1',
      isProof: false,
      lastReviewAt: null,
      locale: 'ru',
    });
    expect(card.card.options[ref.value.correctIndex as number]).toBe('яблоко');
    expect(nextVocab).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, timeZone: 'Europe/Berlin' }),
    );
  });

  it('a recall card shows no answer; its ref carries the review moment, no index', async () => {
    const card = await served({ mode: 'full_recall', lastReviewAt: 123n, reason: 'REVIEW_DUE' });
    expect(card.card).toEqual({ mode: 'full_recall', gloss: 'яблоко' });
    expect(card.canProve).toBe(false);
    expectNoAnswerKey(card, 'apple');
    const ref = await decryptVocabRef(card.vocabRef, USER);
    expect(ref).toMatchObject({ ok: true, value: { lastReviewAt: 123n, correctIndex: null } });
  });

  it.each([
    ['other', 'en', 'a kind of apple'],
    [null, 'de', 'яблоко-de'],
    ['uk', 'de', 'яблоко-uk'],
  ])('native %s with UI %s glosses as %s', async (native, uiLocale, gloss) => {
    getNativeLanguage.mockResolvedValue(native);
    nextVocab.mockResolvedValueOnce(selection({ mode: 'l1_to_en', lastReviewAt: 5n }));
    const out = await load({ uiLocale });
    expect(out).toMatchObject({ ok: true, value: { card: { mode: 'l1_to_en', gloss } } });
  });

  it('carries the part of speech; H reveals a mask in full recall only', async () => {
    expect(await served()).toMatchObject({ pos: 'NOUN', hint: null });
    expect(await served({ mode: 'full_recall', lastReviewAt: 1n })).toMatchObject({
      card: { mode: 'full_recall' },
      hint: 'a____',
    });
    // Cued recall shows the mask already.
    expect(await served({ mode: 'cued_recall', lastReviewAt: 1n })).toMatchObject({ hint: null });
    expect(await served({ mode: 'cloze', lastReviewAt: 1n })).toMatchObject({ hint: null });
  });

  it('nothing due: done with the next due moment', async () => {
    nextVocab.mockResolvedValueOnce({
      ok: false,
      reason: 'NOTHING_DUE',
      nextDueAt: 1_900_000_000_000n,
      remainingNew: 0,
    });
    expect(await load()).toEqual({
      ok: true,
      value: { status: 'done', nextDueAt: 1_900_000_000_000, remainingNew: 0 },
    });
  });

  it('passes a topic and the words just shown to selection', async () => {
    const scope = { kind: 'concept', conceptId: CONCEPT } as const;
    await load({ scope, excludeItemIds: ['item-bread'] });
    expect(nextVocab).toHaveBeenCalledWith(
      expect.objectContaining({ scope, excludeItemIds: ['item-bread'] }),
    );
  });

  it('a selected word missing from the pool is NOT_FOUND', async () => {
    nextVocab.mockResolvedValueOnce(selection({ itemId: 'item-unknown' }));
    expect(await load()).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('submitVocabAttempt', () => {
  const choiceIndex = async (vocabRef: string) => {
    const ref = await decryptVocabRef(vocabRef, USER);
    if (!ref.ok || ref.value.correctIndex === null) throw new Error('choice ref');
    return ref.value.correctIndex;
  };

  it('grades a choice against the sealed index and records through the vocab path', async () => {
    const card = await served();
    const index = await choiceIndex(card.vocabRef);
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
      timeMs: 2100,
      attemptKey: 'key-1',
    });

    expect(recordVocabOutcome).toHaveBeenCalledExactlyOnceWith({
      userId: USER,
      itemId: APPLE,
      mode: 'recognition',
      proof: false,
      hinted: undefined,
      timeMs: 2100,
      idempotencyKey: 'key-1',
      expectedLastReviewAt: null,
      correct: true,
      analytics: { variant: 'en_to_l1', locale: 'ru' },
    });
    expect(out).toEqual({
      ok: true,
      value: {
        status: 'answered',
        verdict: 'correct',
        correctIndex: index,
        chosenIndex: index,
        word: {
          lemma: 'apple',
          ipa: 'apple',
          gloss: 'яблоко',
          definition: 'a kind of apple',
          example: { sentence: 'I like the apple a lot.', translation: 'пример яблоко' },
        },
        proven: false,
        review: { kind: 'backSoon' },
      },
    });
  });

  it('a pool refresh after the card was served does not shift its grading', async () => {
    const card = await served();
    const index = await choiceIndex(card.vocabRef);
    // vocab:publish added words: a rebuilt card could shuffle differently.
    const grown = [...LEXEMES, word('rice', 'рис'), word('salt', 'соль'), word('tea', 'чай')];
    getVocabPool.mockResolvedValue({
      lexemes: grown,
      byItemId: new Map(grown.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(grown.map((l) => [l.id, l.itemId])),
    });
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
    });
    expect(recordVocabOutcome).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });

  it('a wrong choice and don’t-know record as such', async () => {
    const card = await served();
    const index = await choiceIndex(card.vocabRef);
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index: (index + 1) % 4 },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({ correct: false }),
    );
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'dontKnow' },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({ dontKnow: true }),
    );
  });

  it('a wrong choice records the Item of the option picked — the word it was confused with (B6.1)', async () => {
    const card = await served();
    const view = card.card;
    if (view.mode !== 'en_to_l1') throw new Error('mode');
    const index = await choiceIndex(card.vocabRef);
    const wrong = (index + 1) % 4;
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index: wrong },
    });

    const picked = view.options[wrong];
    const confused = LEXEMES.find((l) => l.translations.ru === picked);
    if (!confused) throw new Error('the option names no lexeme');
    expect(confused.itemId).not.toBe(APPLE);
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correct: false,
        analytics: { variant: 'en_to_l1', locale: 'ru', chosenItemId: confused.itemId },
      }),
    );
    // A don't-know on the same card names no option.
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'dontKnow' },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({ dontKnow: true, analytics: { variant: 'en_to_l1', locale: 'ru' } }),
    );
  });

  it('a ref issued before B6.1 (no option ids) still grades; the wrong pick records no chosenItemId', async () => {
    const card = await served();
    const sealed = await decryptVocabRef(card.vocabRef, USER);
    if (!sealed.ok || sealed.value.correctIndex === null) throw new Error('choice ref');
    const legacy = await encryptVocabRef({ ...sealed.value, userId: USER, optionItemIds: null });
    const wrong = (sealed.value.correctIndex + 1) % 4;
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: legacy,
      answer: { type: 'choice', index: wrong },
    });
    expect(out).toMatchObject({
      ok: true,
      value: { verdict: 'incorrect', correctIndex: sealed.value.correctIndex },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({ correct: false, analytics: { variant: 'en_to_l1', locale: 'ru' } }),
    );
  });

  it('a cloze that fell back to l1_to_en is recorded as the card shown', async () => {
    // The blank is a plural no other word has an example of: no fair cloze.
    const eggs = {
      ...word('egg', 'яйцо'),
      examples: [{ sentence: 'I like the eggs a lot.', translation: {}, clozeTarget: 'eggs' }],
    };
    const pool = [...LEXEMES, eggs];
    getVocabPool.mockResolvedValue({
      lexemes: pool,
      byItemId: new Map(pool.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(pool.map((l) => [l.id, l.itemId])),
    });
    const card = await served({ itemId: 'item-egg', mode: 'cloze', lastReviewAt: 5n });
    expect(card.card.mode).toBe('l1_to_en');
    const index = await choiceIndex(card.vocabRef);
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'recognition',
        analytics: { variant: 'l1_to_en', locale: 'ru' },
      }),
    );
  });

  it('B6.5: a B1+ learner’s rung-2 card may be definition_to_en — sealed, graded and recorded as it', async () => {
    // A definition that names neither the word nor any other word of the pool.
    const stew = { ...word('stew', 'рагу'), definitions: { en: 'a hot dish cooked slowly' } };
    const pool = [...LEXEMES, stew];
    getVocabPool.mockResolvedValue({
      lexemes: pool,
      byItemId: new Map(pool.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(pool.map((l) => [l.id, l.itemId])),
    });
    const rung2 = (lastReviewAt: bigint, learnerLevel: string | null) =>
      served({ itemId: 'item-stew', mode: 'l1_to_en', lastReviewAt, learnerLevel });
    const modes = new Map<bigint, string>();
    for (let at = 1n; at <= 12n; at++) modes.set(at, (await rung2(at, 'B1')).card.mode);
    expect(new Set(modes.values())).toEqual(new Set(['l1_to_en', 'definition_to_en']));
    // Without an assessed level the rung serves only its own card.
    for (let at = 1n; at <= 12n; at++) expect((await rung2(at, null)).card.mode).toBe('l1_to_en');

    const at = [...modes].find(([, mode]) => mode === 'definition_to_en')?.[0] ?? 0n;
    const card = await rung2(at, 'B2');
    expect(card.card).toMatchObject({
      mode: 'definition_to_en',
      definition: 'a hot dish cooked slowly',
    });
    expectNoAnswerKey(card);
    expect(await decryptVocabRef(card.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { mode: 'definition_to_en' },
    });
    const index = await choiceIndex(card.vocabRef);
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
    });
    expect(out).toMatchObject({ ok: true, value: { verdict: 'correct', correctIndex: index } });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correct: true,
        mode: 'recognition',
        analytics: { variant: 'definition_to_en', locale: 'ru' },
      }),
    );
  });

  it('B6.5: a B1+ learner’s rung-3 card may be collocation — sealed, graded and recorded as it', async () => {
    const bread = { ...word('bread', 'хлеб'), collocations: ['fresh bread every day'] };
    const pool = [...LEXEMES.filter((l) => l.lemma !== 'bread'), bread];
    getVocabPool.mockResolvedValue({
      lexemes: pool,
      byItemId: new Map(pool.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(pool.map((l) => [l.id, l.itemId])),
    });
    const rung3 = (lastReviewAt: bigint, learnerLevel: string | null) =>
      served({ itemId: 'item-bread', mode: 'cloze', lastReviewAt, learnerLevel });
    const modes = new Map<bigint, string>();
    for (let at = 1n; at <= 12n; at++) modes.set(at, (await rung3(at, 'B1')).card.mode);
    expect(new Set(modes.values())).toEqual(new Set(['cloze', 'collocation']));
    for (let at = 1n; at <= 12n; at++) expect((await rung3(at, 'A2')).card.mode).toBe('cloze');

    const at = [...modes].find(([, mode]) => mode === 'collocation')?.[0] ?? 0n;
    const card = await rung3(at, 'C1');
    expect(card.card).toMatchObject({ mode: 'collocation', phrase: 'fresh ___ every day' });
    expectNoAnswerKey(card);
    expect(await decryptVocabRef(card.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { mode: 'collocation' },
    });
    const index = await choiceIndex(card.vocabRef);
    if (card.card.mode !== 'collocation') throw new Error('mode');
    expect(card.card.options[index]).toBe('bread');
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correct: true,
        mode: 'cloze',
        analytics: { variant: 'collocation', locale: 'ru' },
      }),
    );
  });

  it('a typed answer records what was typed (the write path normalizes and cuts it)', async () => {
    const card = await served({ itemId: 'item-pasta', mode: 'full_recall', lastReviewAt: 77n });
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'text', value: ' Rice ' },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correct: false,
        analytics: { variant: 'full_recall', locale: 'ru', answerText: ' Rice ' },
      }),
    );
  });

  it('grades recall typed answers: lemma and variants accepted, carries the review moment', async () => {
    const card = await served({ itemId: 'item-pasta', mode: 'full_recall', lastReviewAt: 77n });
    for (const value of ['Pasta', ' macaroni ']) {
      await submitVocabAttempt({
        userId: USER,
        vocabRef: card.vocabRef,
        answer: { type: 'text', value },
      });
      expect(recordVocabOutcome).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'recall', correct: true, expectedLastReviewAt: 77n }),
      );
    }
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'text', value: 'rice' },
    });
    expect(recordVocabOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({ correct: false }),
    );
  });

  it('a synonym asks again and records nothing', async () => {
    const synonymPool = [
      ...LEXEMES,
      { ...word('stock', 'бульон'), itemId: 'item-stock', id: 'lex-stock' },
    ];
    getVocabPool.mockResolvedValue({
      lexemes: synonymPool,
      byItemId: new Map(synonymPool.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(synonymPool.map((l) => [l.id, l.itemId])),
    });
    const card = await served({ itemId: 'item-broth', mode: 'full_recall', lastReviewAt: 9n });
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'text', value: 'stock' },
      attemptKey: 'key-s',
    });
    expect(out).toEqual({ ok: true, value: { status: 'synonym_retry' } });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
    // The same card, the same key: the right word now records.
    await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'text', value: 'broth' },
      attemptKey: 'key-s',
    });
    expect(recordVocabOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, idempotencyKey: 'key-s' }),
    );
  });

  it('STALE from the write path is reported stale', async () => {
    recordVocabOutcome.mockResolvedValueOnce({ ok: false, error: 'STALE' });
    const card = await served();
    expect(
      await submitVocabAttempt({
        userId: USER,
        vocabRef: card.vocabRef,
        answer: { type: 'dontKnow' },
      }),
    ).toEqual({ ok: true, value: { status: 'stale' } });
  });

  it('a duplicate reports what was first recorded, not the resend', async () => {
    const card = await served();
    const index = await choiceIndex(card.vocabRef);
    recordVocabOutcome.mockResolvedValueOnce(
      recorded({ duplicate: true, original: { correct: false, dontKnow: false, hinted: false } }),
    );
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: card.vocabRef,
      answer: { type: 'choice', index },
      attemptKey: 'key-1',
    });
    expect(out).toMatchObject({ ok: true, value: { verdict: 'incorrect', chosenIndex: null } });
  });

  it.each([
    ['IDEMPOTENCY_CONFLICT', 'INVALID'],
    ['ITEM_NOT_FOUND', 'NOT_FOUND'],
  ])('%s from the write path is %s', async (error, mapped) => {
    recordVocabOutcome.mockResolvedValueOnce({ ok: false, error });
    const card = await served();
    expect(
      await submitVocabAttempt({
        userId: USER,
        vocabRef: card.vocabRef,
        answer: { type: 'dontKnow' },
      }),
    ).toEqual({ ok: false, error: mapped });
  });

  it('refuses refs that are foreign, expired, forged, or answers of the wrong kind; records nothing', async () => {
    const card = await served();
    const other = await encryptVocabRef({
      userId: 'user_2',
      itemId: APPLE,
      mode: 'en_to_l1',
      isProof: false,
      lastReviewAt: null,
      locale: 'ru',
      correctIndex: 0,
      optionItemIds: null,
    });
    const expired = await encryptVocabRef(
      {
        userId: USER,
        itemId: APPLE,
        mode: 'en_to_l1',
        isProof: false,
        lastReviewAt: null,
        locale: 'ru',
        correctIndex: 0,
        optionItemIds: null,
      },
      Date.now() - 25 * 3_600_000,
    );
    // A recall mode with a sealed index cannot have been issued by us.
    const recallWithIndex = await encryptVocabRef({
      userId: USER,
      itemId: APPLE,
      mode: 'full_recall',
      isProof: false,
      lastReviewAt: 1n,
      locale: 'ru',
      correctIndex: 1,
      optionItemIds: null,
    });
    for (const vocabRef of [
      other,
      expired,
      'garbage',
      `${card.vocabRef.slice(0, -2)}AA`,
      recallWithIndex,
    ]) {
      expect(
        await submitVocabAttempt({ userId: USER, vocabRef, answer: { type: 'choice', index: 0 } }),
      ).toEqual({ ok: false, error: 'INVALID' });
    }
    for (const answer of [
      { type: 'text' as const, value: 'apple' },
      { type: 'choice' as const, index: 4 },
      { type: 'choice' as const, index: -1 },
    ]) {
      expect(await submitVocabAttempt({ userId: USER, vocabRef: card.vocabRef, answer })).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('a word unpublished since it was served is NOT_FOUND, nothing recorded', async () => {
    const card = await served();
    getVocabPool.mockResolvedValue({
      lexemes: [],
      byItemId: new Map(),
      itemIdByLexemeId: new Map(),
    });
    expect(
      await submitVocabAttempt({
        userId: USER,
        vocabRef: card.vocabRef,
        answer: { type: 'dontKnow' },
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });
});

describe('"Know -> prove"', () => {
  it('turns a new word’s first card into a cued recall proof', async () => {
    const card = await served();
    const out = await startVocabProof({ userId: USER, vocabRef: card.vocabRef });
    if (!out.ok || 'status' in out.value) throw new Error('expected a proof card');
    // Proving knowledge takes no hint.
    expect(out.value).toMatchObject({ isProof: true, canProve: false, hint: null, pos: 'NOUN' });
    expect(out.value.card).toEqual({ mode: 'cued_recall', gloss: 'яблоко', cue: 'a____' });
    expectNoAnswerKey(out.value, 'apple');
    expect(await decryptVocabRef(out.value.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { mode: 'cued_recall', isProof: true, lastReviewAt: null, correctIndex: null },
    });
    expect(hasItemReviewState).toHaveBeenCalledWith({}, { userId: USER, itemId: APPLE });
  });

  it('a passed proof records EASY-eligible recall with the proof flag', async () => {
    const card = await served();
    const proof = await startVocabProof({ userId: USER, vocabRef: card.vocabRef });
    if (!proof.ok || 'status' in proof.value) throw new Error('proof');
    recordVocabOutcome.mockResolvedValueOnce(recorded({ rating: 'EASY', scheduledDays: 8 }));

    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: proof.value.vocabRef,
      answer: { type: 'text', value: 'apple' },
      attemptKey: 'key-p',
    });

    expect(recordVocabOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'recall',
        proof: true,
        correct: true,
        expectedLastReviewAt: null,
        idempotencyKey: 'key-p',
        analytics: { variant: 'cued_recall', locale: 'ru', answerText: 'apple' },
      }),
    );
    expect(out).toMatchObject({
      ok: true,
      value: { proven: true, review: { kind: 'backInDays', days: 8 } },
    });
  });

  it.each([
    ['wrong', { type: 'text' as const, value: 'bread' }, { correct: false }],
    ['don’t know', { type: 'dontKnow' as const }, { dontKnow: true }],
  ])('a %s proof records an ordinary attempt without the flag', async (_, answer, expected) => {
    const card = await served();
    const proof = await startVocabProof({ userId: USER, vocabRef: card.vocabRef });
    if (!proof.ok || 'status' in proof.value) throw new Error('proof');
    recordVocabOutcome.mockResolvedValueOnce(recorded({ rating: 'AGAIN' }));
    const out = await submitVocabAttempt({ userId: USER, vocabRef: proof.value.vocabRef, answer });
    expect(recordVocabOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ proof: false, mode: 'recall', ...expected }),
    );
    expect(out).toMatchObject({ ok: true, value: { proven: false } });
  });

  it('a word answered since (another tab) is stale; nothing is issued', async () => {
    const card = await served();
    hasItemReviewState.mockResolvedValueOnce(true);
    expect(await startVocabProof({ userId: USER, vocabRef: card.vocabRef })).toEqual({
      ok: true,
      value: { status: 'stale' },
    });
  });

  it.each([
    ['a reviewed word', { mode: 'en_to_l1', lastReviewAt: 5n }],
    ['a later mode', { mode: 'l1_to_en', lastReviewAt: null }],
  ])('refuses a proof of %s', async (_, over) => {
    const card = await served(over);
    expect(await startVocabProof({ userId: USER, vocabRef: card.vocabRef })).toEqual({
      ok: false,
      error: 'INVALID',
    });
    expect(hasItemReviewState).not.toHaveBeenCalled();
  });

  it('refuses a proof of a proof, and a foreign ref', async () => {
    const card = await served();
    const proof = await startVocabProof({ userId: USER, vocabRef: card.vocabRef });
    if (!proof.ok || 'status' in proof.value) throw new Error('proof');
    expect(await startVocabProof({ userId: USER, vocabRef: proof.value.vocabRef })).toEqual({
      ok: false,
      error: 'INVALID',
    });
    expect(await startVocabProof({ userId: 'user_2', vocabRef: card.vocabRef })).toEqual({
      ok: false,
      error: 'INVALID',
    });
  });
});
