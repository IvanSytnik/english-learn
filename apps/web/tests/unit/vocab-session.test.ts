import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  nextVocab,
  remainingNew,
  recordVocabOutcome,
  getVocabPool,
  getNativeLanguage,
  hasItemReviewState,
} = vi.hoisted(() => ({
  nextVocab: vi.fn(),
  remainingNew: vi.fn(),
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
  vocabSessionService: { nextVocab, remainingNew },
}));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const {
  loadCardAfterIntro,
  loadNextVocabCard,
  startVocabProof,
  startWordProof,
  submitVocabAttempt,
} = await import('@/lib/vocab-session');
const { decryptVocabRef, encryptVocabRef, VOCAB_REF_DOMAIN } = await import(
  '@/lib/crypto/vocab-ref'
);
const { createSealedRef } = await import('@/lib/crypto/sealed-ref');

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
  bySlug: new Map(LEXEMES.map((l) => [`${l.lemma}-noun`, l])),
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

const afterIntro = (introRef: string, userId = USER) =>
  loadCardAfterIntro({ userId, uiLocale: 'en', timeZone: 'Europe/Berlin', introRef });

/** The question served for a selection; a new word's intro card is passed first (B6.5). */
async function served(over = {}) {
  nextVocab.mockResolvedValueOnce(selection(over));
  let out = await load();
  if (out.ok && out.value.status === 'intro') out = await afterIntro(out.value.vocabRef);
  if (!out.ok || out.value.status !== 'card') throw new Error('expected a card');
  return out.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  getVocabPool.mockResolvedValue(POOL);
  getNativeLanguage.mockResolvedValue('ru');
  hasItemReviewState.mockResolvedValue(false);
  remainingNew.mockResolvedValue(7);
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

  it('B6.5a: collocation is held back — a B1+ learner’s rung-3 card is cloze, whatever the seed', async () => {
    const bread = { ...word('bread', 'хлеб'), collocations: ['fresh bread every day'] };
    const pool = [...LEXEMES.filter((l) => l.lemma !== 'bread'), bread];
    getVocabPool.mockResolvedValue({
      lexemes: pool,
      byItemId: new Map(pool.map((l) => [l.itemId, l])),
      itemIdByLexemeId: new Map(pool.map((l) => [l.id, l.itemId])),
    });
    // Before the hold-back, about half of these seeds served the collocation.
    for (let at = 1n; at <= 12n; at++) {
      for (const learnerLevel of ['B1', 'C1', 'A2', null]) {
        const card = await served({
          itemId: 'item-bread',
          mode: 'cloze',
          lastReviewAt: at,
          learnerLevel,
        });
        expect(card.card.mode, `${at} ${learnerLevel}`).toBe('cloze');
        expect(await decryptVocabRef(card.vocabRef, USER)).toMatchObject({
          ok: true,
          value: { mode: 'cloze' },
        });
      }
    }
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
      kind: 'question',
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
        kind: 'question',
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
      kind: 'question',
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
    // Not a NEW selection: served straight, with no intro card first.
    ['a later mode', { mode: 'l1_to_en', lastReviewAt: null, reason: 'LEARNING' }],
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

describe('"I know" on a word page (B6.6): the proof by public slug', () => {
  const prove = (slug: string, userId = USER) => startWordProof({ userId, uiLocale: 'en', slug });

  it('a never-answered word opens its proof card; no id, no key on the client', async () => {
    const out = await prove('apple-noun');
    if (!out.ok || 'status' in out.value) throw new Error('expected a proof card');
    expect(out.value).toMatchObject({ isProof: true, canProve: false, hint: null, pos: 'NOUN' });
    expect(out.value.card).toEqual({ mode: 'cued_recall', gloss: 'яблоко', cue: 'a____' });
    expectNoAnswerKey(out.value, 'apple');
    expect(hasItemReviewState).toHaveBeenCalledWith({}, { userId: USER, itemId: APPLE });
    expect(nextVocab).not.toHaveBeenCalled();
  });

  it('the proof it issues is the B2.5 proof: a pass records with the proof flag', async () => {
    const proof = await prove('apple-noun');
    if (!proof.ok || 'status' in proof.value) throw new Error('proof');
    recordVocabOutcome.mockResolvedValueOnce(recorded({ rating: 'EASY', scheduledDays: 8 }));
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: proof.value.vocabRef,
      answer: { type: 'text', value: 'apple' },
      attemptKey: 'key-w',
    });
    expect(recordVocabOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: APPLE,
        proof: true,
        correct: true,
        expectedLastReviewAt: null,
      }),
    );
    expect(out).toMatchObject({ ok: true, value: { proven: true } });
  });

  it('the proof ref is sealed for its learner only', async () => {
    const proof = await prove('apple-noun');
    if (!proof.ok || 'status' in proof.value) throw new Error('proof');
    expect(
      await submitVocabAttempt({
        userId: 'user_2',
        vocabRef: proof.value.vocabRef,
        answer: { type: 'text', value: 'apple' },
      }),
    ).toEqual({ ok: false, error: 'INVALID' });
  });

  it('an unknown slug (or one the pool left out: ambiguous, unpublished) is NOT_FOUND', async () => {
    expect(await prove('apple-verb')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(hasItemReviewState).not.toHaveBeenCalled();
  });

  it('a word already answered is stale: being learned, nothing to prove', async () => {
    hasItemReviewState.mockResolvedValueOnce(true);
    expect(await prove('apple-noun')).toEqual({ ok: true, value: { status: 'stale' } });
  });
});

describe('the intro card (B6.5, V2-11)', () => {
  async function introRef(over = {}) {
    nextVocab.mockResolvedValueOnce(selection(over));
    const out = await load();
    if (!out.ok || out.value.status !== 'intro') throw new Error('expected an intro');
    return out.value;
  }

  it('a NEW word never answered opens on its intro: no options, no key, no ids, nothing recorded', async () => {
    const intro = await introRef({ learnerLevel: null });
    expect(intro).toMatchObject({
      status: 'intro',
      remainingNew: 7,
      word: {
        word: 'apple',
        pos: 'NOUN',
        ipa: 'apple',
        meaning: { kind: 'gloss', text: 'яблоко' },
        example: { sentence: 'I like the apple a lot.', translation: 'пример яблоко' },
        collocations: [],
      },
    });
    expectNoAnswerKey(intro);
    expect(JSON.stringify(intro)).not.toContain('"options"');
    expect(await decryptVocabRef(intro.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { kind: 'intro', itemId: APPLE, lastReviewAt: null, correctIndex: null },
    });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('a B1+ learner’s intro shows the English definition', async () => {
    const intro = await introRef({ learnerLevel: 'B1' });
    expect(intro.word.meaning).toEqual({ kind: 'definition', text: 'a kind of apple' });
  });

  it('not for a word already answered or not NEW: the question straight away', async () => {
    nextVocab.mockResolvedValueOnce(
      selection({ reason: 'REVIEW_DUE', mode: 'l1_to_en', lastReviewAt: 9n }),
    );
    expect(await load()).toMatchObject({ ok: true, value: { status: 'card' } });
  });

  it('afterIntro → the en_to_l1 question for the same word, without running the selector', async () => {
    const intro = await introRef();
    nextVocab.mockClear();
    const out = await afterIntro(intro.vocabRef);
    expect(out).toMatchObject({
      ok: true,
      value: {
        status: 'card',
        card: { mode: 'en_to_l1', word: 'apple' },
        canProve: true,
        remainingNew: 7,
      },
    });
    expect(nextVocab).not.toHaveBeenCalled();
    expect(hasItemReviewState).toHaveBeenCalledWith({}, { userId: USER, itemId: APPLE });
    if (!out.ok || out.value.status !== 'card') throw new Error('card');
    expect(await decryptVocabRef(out.value.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { kind: 'question', itemId: APPLE, mode: 'en_to_l1', lastReviewAt: null },
    });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('afterIntro on a word answered since (another tab): normal selection', async () => {
    const intro = await introRef();
    nextVocab.mockClear();
    hasItemReviewState.mockResolvedValueOnce(true);
    nextVocab.mockResolvedValueOnce(
      selection({ itemId: 'item-bread', reason: 'LEARNING', mode: 'en_to_l1', lastReviewAt: 4n }),
    );
    const out = await afterIntro(intro.vocabRef);
    expect(nextVocab).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ ok: true, value: { status: 'card', card: { word: 'bread' } } });
  });

  it('afterIntro refuses a question ref, a foreign learner’s intro, an expired or forged one — like a tampered ref', async () => {
    const intro = await introRef();
    const question = await served({ reason: 'LEARNING', lastReviewAt: 3n });
    const opened = await decryptVocabRef(intro.vocabRef, USER);
    if (!opened.ok) throw new Error('intro ref');
    const expired = await encryptVocabRef(
      { ...opened.value, userId: USER },
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    );
    hasItemReviewState.mockClear();
    nextVocab.mockClear();
    for (const [ref, user] of [
      [question.vocabRef, USER],
      [intro.vocabRef, 'user_2'],
      [expired, USER],
      [`${intro.vocabRef.slice(0, -2)}xx`, USER],
    ] as const) {
      expect(await afterIntro(ref, user)).toEqual({ ok: false, error: 'INVALID' });
    }
    expect(hasItemReviewState).not.toHaveBeenCalled();
    expect(nextVocab).not.toHaveBeenCalled();
  });

  it('submitVocab refuses an intro ref like a tampered one: nothing graded, no event', async () => {
    const intro = await introRef();
    for (const answer of [
      { type: 'choice', index: 0 },
      { type: 'dontKnow' },
      { type: 'text', value: 'apple' },
    ] as const) {
      expect(await submitVocabAttempt({ userId: USER, vocabRef: intro.vocabRef, answer })).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('the refusal is by kind alone: even a sealed intro ref carrying a choice index is not graded', async () => {
    // Not something the server issues — the kind check must not lean on it.
    const card = await served({ reason: 'LEARNING', mode: 'en_to_l1', lastReviewAt: 8n });
    const opened = await decryptVocabRef(card.vocabRef, USER);
    if (!opened.ok || opened.value.correctIndex === null) throw new Error('ref');
    const r = opened.value;
    const index = r.correctIndex as number;
    const asIntro = await createSealedRef(VOCAB_REF_DOMAIN).seal({
      u: USER,
      i: r.itemId,
      m: r.mode,
      p: false,
      r: '8',
      l: r.locale,
      k: index,
      t: 'intro',
      e: Date.now() + 60_000,
    });
    expect(
      await submitVocabAttempt({
        userId: USER,
        vocabRef: asIntro,
        answer: { type: 'choice', index },
      }),
    ).toEqual({ ok: false, error: 'INVALID' });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('K on the intro card opens the proof (B6.6): the same cued recall check, nothing recorded', async () => {
    const intro = await introRef();
    const out = await startVocabProof({ userId: USER, vocabRef: intro.vocabRef });
    if (!out.ok || 'status' in out.value) throw new Error('expected a proof card');
    expect(out.value).toMatchObject({ isProof: true, canProve: false, hint: null, pos: 'NOUN' });
    expect(out.value.card).toEqual({ mode: 'cued_recall', gloss: 'яблоко', cue: 'a____' });
    expectNoAnswerKey(out.value, 'apple');
    expect(await decryptVocabRef(out.value.vocabRef, USER)).toMatchObject({
      ok: true,
      value: { kind: 'question', mode: 'cued_recall', isProof: true, lastReviewAt: null },
    });
    expect(recordVocabOutcome).not.toHaveBeenCalled();
  });

  it('an intro whose word was answered since (another tab) is stale', async () => {
    const intro = await introRef();
    hasItemReviewState.mockResolvedValueOnce(true);
    expect(await startVocabProof({ userId: USER, vocabRef: intro.vocabRef })).toEqual({
      ok: true,
      value: { status: 'stale' },
    });
  });

  it('a ref issued before B6.5 (no kind) is a question: it still submits', async () => {
    const card = await served({ reason: 'LEARNING', mode: 'en_to_l1', lastReviewAt: 6n });
    const opened = await decryptVocabRef(card.vocabRef, USER);
    if (!opened.ok || opened.value.correctIndex === null) throw new Error('ref');
    const r = opened.value;
    const index = opened.value.correctIndex;
    const legacy = await createSealedRef(VOCAB_REF_DOMAIN).seal({
      u: USER,
      i: r.itemId,
      m: r.mode,
      p: r.isProof,
      r: r.lastReviewAt === null ? null : r.lastReviewAt.toString(),
      l: r.locale,
      k: r.correctIndex,
      e: Date.now() + 60_000,
    });
    expect(await decryptVocabRef(legacy, USER)).toMatchObject({
      ok: true,
      value: { kind: 'question' },
    });
    const out = await submitVocabAttempt({
      userId: USER,
      vocabRef: legacy,
      answer: { type: 'choice', index },
    });
    expect(out).toMatchObject({ ok: true, value: { status: 'answered', verdict: 'correct' } });
    expect(recordVocabOutcome).toHaveBeenCalledTimes(1);
  });
});
