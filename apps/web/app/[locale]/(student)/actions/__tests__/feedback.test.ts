import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, createBetaFeedback, getPublishedPracticeItem, getVocabPool } = vi.hoisted(() => ({
  auth: vi.fn(),
  createBetaFeedback: vi.fn(),
  getPublishedPracticeItem: vi.fn(),
  getVocabPool: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/feedback', () => ({ createBetaFeedback }));
vi.mock('@englishlearn/db/queries/exercises', () => ({ getPublishedPracticeItem }));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { submitBetaFeedbackAction } = await import('@/app/[locale]/(student)/actions/feedback');
const { encryptItemRef, ITEM_REF_TTL_MS } = await import('@/lib/crypto/item-ref');
const { encryptVocabRef, VOCAB_REF_TTL_MS } = await import('@/lib/crypto/vocab-ref');

const valid = { text: 'The answer key is wrong', url: '/en/exercises', itemId: 'item-1' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
  createBetaFeedback.mockResolvedValue({ id: 'fb-1' });
  getPublishedPracticeItem.mockResolvedValue({
    id: 'item.vocab.travel.luggage',
    concept: { id: 'vocab.travel' },
  });
});

describe('submitBetaFeedbackAction', () => {
  it('rejects a signed-out user without touching the database', async () => {
    auth.mockResolvedValue(null);
    expect(await submitBetaFeedbackAction(valid)).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects text shorter than 5 characters after trimming', async () => {
    expect(await submitBetaFeedbackAction({ ...valid, text: '  abcd  ' })).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects text longer than 1000 characters', async () => {
    expect(await submitBetaFeedbackAction({ ...valid, text: 'a'.repeat(1001) })).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects input that is not an object', async () => {
    expect(await submitBetaFeedbackAction('hello world')).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
  });

  it("stores the report as the session's user, whatever userId the input claims", async () => {
    const result = await submitBetaFeedbackAction({ ...valid, userId: 'someone-else' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(createBetaFeedback).toHaveBeenCalledTimes(1);
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { ...valid, kind: 'CONTENT_ERROR', userId: 'user-1' },
    );
  });

  it('logs a database failure and returns only INTERNAL_ERROR to the client', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createBetaFeedback.mockRejectedValue(new Error('connection to db.secret-host refused'));

    const result = await submitBetaFeedbackAction(valid);

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('secret-host');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('submitBetaFeedbackAction: a report from the player (itemRef)', () => {
  const report = { text: 'Two options are correct', url: '/en/exercises', kind: 'CONTENT_ERROR' };
  const ITEM = 'item.vocab.travel.luggage';

  it("stores the item the reference decrypts to, and that item's concept", async () => {
    const itemRef = await encryptItemRef({ itemId: ITEM, userId: 'user-1' });
    const result = await submitBetaFeedbackAction({ ...report, itemRef });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(getPublishedPracticeItem).toHaveBeenCalledWith(ITEM);
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { ...report, itemId: ITEM, conceptId: 'vocab.travel', userId: 'user-1' },
    );
  });

  it('the reference wins over ids the client names', async () => {
    const itemRef = await encryptItemRef({ itemId: ITEM, userId: 'user-1' });
    await submitBetaFeedbackAction({ ...report, itemRef, itemId: 'other', conceptId: 'other' });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({ itemId: ITEM, conceptId: 'vocab.travel' }),
    );
  });

  it('an item unpublished since it was shown is still reported, without a concept', async () => {
    getPublishedPracticeItem.mockResolvedValue(null);
    const itemRef = await encryptItemRef({ itemId: ITEM, userId: 'user-1' });
    expect(await submitBetaFeedbackAction({ ...report, itemRef })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({ itemId: ITEM, conceptId: null }),
    );
  });

  it('refuses a forged, foreign or expired reference without storing anything', async () => {
    for (const itemRef of [
      ITEM,
      'not-a-token',
      await encryptItemRef({ itemId: ITEM, userId: 'user-2' }),
      await encryptItemRef({ itemId: ITEM, userId: 'user-1' }, Date.now() - ITEM_REF_TTL_MS - 1),
      '',
    ]) {
      expect(await submitBetaFeedbackAction({ ...report, itemRef }), itemRef).toEqual({
        ok: false,
        error: 'VALIDATION_ERROR',
      });
    }
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('a failed item lookup is logged and returns only INTERNAL_ERROR', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getPublishedPracticeItem.mockRejectedValue(new Error('connection to db.secret-host refused'));
    const itemRef = await encryptItemRef({ itemId: ITEM, userId: 'user-1' });

    const result = await submitBetaFeedbackAction({ ...report, itemRef });

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
    expect(createBetaFeedback).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('submitBetaFeedbackAction: a report from the vocabulary player (vocabRef)', () => {
  const report = { text: 'The translation is wrong', url: '/en/words', kind: 'CONTENT_ERROR' };
  const ITEM = 'cm-item-luggage';
  const word = {
    itemId: ITEM,
    id: 'cm-lex-luggage',
    lemma: 'luggage',
    conceptId: 'vocab.travel.a2',
  };
  const vocabRef = (
    over: { userId?: string; mode?: 'cloze' | 'full_recall' } = {},
    nowMs?: number,
  ) =>
    encryptVocabRef(
      {
        userId: over.userId ?? 'user-1',
        itemId: ITEM,
        mode: over.mode ?? 'cloze',
        isProof: false,
        lastReviewAt: 5n,
        locale: 'ru',
        correctIndex: over.mode === 'full_recall' ? null : 2,
      },
      nowMs,
    );

  beforeEach(() => {
    getVocabPool.mockResolvedValue({ lexemes: [word], byItemId: new Map([[ITEM, word]]) });
  });

  it('stores the word, its concept and the server-built word context', async () => {
    const result = await submitBetaFeedbackAction({ ...report, vocabRef: await vocabRef() });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      {
        ...report,
        itemId: ITEM,
        conceptId: 'vocab.travel.a2',
        metadata: { lexemeId: 'cm-lex-luggage', lemma: 'luggage', vocabMode: 'cloze' },
        userId: 'user-1',
      },
    );
  });

  it('records the payload mode of the served card', async () => {
    await submitBetaFeedbackAction({
      ...report,
      vocabRef: await vocabRef({ mode: 'full_recall' }),
    });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({ metadata: expect.objectContaining({ vocabMode: 'recall' }) }),
    );
  });

  it('client ids and metadata never override the reference', async () => {
    await submitBetaFeedbackAction({
      ...report,
      vocabRef: await vocabRef(),
      itemId: 'other',
      conceptId: 'other',
      metadata: { lexemeId: 'forged', lemma: 'x', vocabMode: 'recall', extra: 1 },
    });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({
        itemId: ITEM,
        conceptId: 'vocab.travel.a2',
        metadata: { lexemeId: 'cm-lex-luggage', lemma: 'luggage', vocabMode: 'cloze' },
      }),
    );
  });

  it('a word unpublished since it was shown is reported without its context', async () => {
    getVocabPool.mockResolvedValue({ lexemes: [], byItemId: new Map() });
    await submitBetaFeedbackAction({ ...report, vocabRef: await vocabRef() });
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      expect.objectContaining({ itemId: ITEM, conceptId: null, metadata: null }),
    );
  });

  it('refuses a forged, foreign, expired or item-domain reference, and both refs at once', async () => {
    const itemRef = await encryptItemRef({ itemId: ITEM, userId: 'user-1' });
    for (const bad of [
      'not-a-token',
      itemRef,
      await vocabRef({ userId: 'user-2' }),
      await vocabRef({}, Date.now() - VOCAB_REF_TTL_MS - 1),
      '',
    ]) {
      expect(await submitBetaFeedbackAction({ ...report, vocabRef: bad })).toEqual({
        ok: false,
        error: 'VALIDATION_ERROR',
      });
    }
    expect(
      await submitBetaFeedbackAction({ ...report, itemRef, vocabRef: await vocabRef() }),
    ).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });
});
