import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { decryptVocabRef, encryptVocabRef, VOCAB_REF_DOMAIN, VOCAB_REF_TTL_MS } = await import(
  '@/lib/crypto/vocab-ref'
);
const { encryptItemRef, decryptItemRef } = await import('@/lib/crypto/item-ref');
const { createSealedRef } = await import('@/lib/crypto/sealed-ref');

const NOW = 1_800_000_000_000;
const REF = {
  itemId: 'cmitem0schedule01',
  mode: 'cloze' as const,
  isProof: false,
  lastReviewAt: 1_799_000_000_123n,
  locale: 'uk' as const,
  correctIndex: 2,
};
const issued = (over = {}, nowMs = NOW) =>
  encryptVocabRef({ ...REF, userId: 'user_1', ...over }, nowMs);
const forged = (payload: unknown) => createSealedRef(VOCAB_REF_DOMAIN).seal(payload);
const valid = { u: 'user_1', i: 'it', m: 'cloze', p: false, r: null, l: 'ru', k: 1, e: NOW + 1000 };

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function flipBit(token: string, byte: number): string {
  const bytes = Buffer.from(token, 'base64url');
  bytes[byte] = (bytes[byte] as number) ^ 1;
  return bytes.toString('base64url');
}

describe('vocab references', () => {
  it('round-trips the served card for the user it was issued to', async () => {
    expect(await decryptVocabRef(await issued(), 'user_1', NOW + 1000)).toEqual({
      ok: true,
      value: REF,
    });
    const proof = { mode: 'cued_recall', isProof: true, lastReviewAt: null, correctIndex: null };
    expect(await decryptVocabRef(await issued(proof), 'user_1', NOW)).toEqual({
      ok: true,
      value: { ...REF, ...proof },
    });
  });

  it('never shows the item, the answer index or the review moment', async () => {
    const a = await issued();
    const b = await issued();
    expect(a).not.toBe(b);
    for (const token of [a, b]) {
      const raw = Buffer.from(token, 'base64url').toString('latin1');
      for (const secret of ['cmitem0schedule01', '1799000000123', '"k"', 'cloze']) {
        expect(token).not.toContain(secret);
        expect(raw).not.toContain(secret);
      }
    }
  });

  it('rejects a tampered token (IV, ciphertext or tag) and garbage', async () => {
    const token = await issued();
    const length = Buffer.from(token, 'base64url').length;
    for (const byte of [0, 20, length - 1]) {
      expect(await decryptVocabRef(flipBit(token, byte), 'user_1', NOW)).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
    for (const junk of ['', 'abc', token.slice(0, 20)]) {
      expect(await decryptVocabRef(junk, 'user_1', NOW)).toEqual({ ok: false, error: 'INVALID' });
    }
  });

  it('refuses another user’s token', async () => {
    expect(await decryptVocabRef(await issued(), 'user_2', NOW)).toEqual({
      ok: false,
      error: 'WRONG_USER',
    });
  });

  it('expires after 24 h', async () => {
    const token = await issued();
    expect((await decryptVocabRef(token, 'user_1', NOW + VOCAB_REF_TTL_MS - 1)).ok).toBe(true);
    expect(await decryptVocabRef(token, 'user_1', NOW + VOCAB_REF_TTL_MS)).toEqual({
      ok: false,
      error: 'EXPIRED',
    });
  });

  it('is domain-separated from item references, both ways', async () => {
    const itemRef = await encryptItemRef({ itemId: 'cmitem0schedule01', userId: 'user_1' }, NOW);
    expect(await decryptVocabRef(itemRef, 'user_1', NOW)).toEqual({ ok: false, error: 'INVALID' });
    expect(await decryptItemRef(await issued(), 'user_1', NOW)).toEqual({
      ok: false,
      error: 'INVALID',
    });
  });

  it('dies with AUTH_SECRET rotation', async () => {
    const token = await issued();
    vi.stubEnv('AUTH_SECRET', 'another-secret-at-least-16-chars');
    expect(await decryptVocabRef(token, 'user_1', NOW)).toEqual({ ok: false, error: 'INVALID' });
  });

  it.each([
    ['an unknown mode', { m: 'spelling' }],
    ['a non-boolean proof flag', { p: 'yes' }],
    ['a non-numeric review moment', { r: '12a' }],
    ['an unknown locale', { l: 'fr' }],
    ['an index out of range', { k: 4 }],
    ['an extra field', { x: 1 }],
    ['a missing user', { u: undefined }],
  ])('rejects a sealed payload with %s', async (_, over) => {
    expect(await decryptVocabRef(await forged(valid), 'user_1', NOW)).toMatchObject({ ok: true });
    expect(await decryptVocabRef(await forged({ ...valid, ...over }), 'user_1', NOW)).toEqual({
      ok: false,
      error: 'INVALID',
    });
  });
});
