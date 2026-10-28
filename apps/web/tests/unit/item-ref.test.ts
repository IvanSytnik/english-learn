import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { decryptItemRef, encryptItemRef, ITEM_REF_TTL_MS } = await import('@/lib/crypto/item-ref');

const NOW = 1_800_000_000_000;
const ref = { itemId: 'item.vocab.daily_life.schedule', userId: 'user_1' };

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Flip one bit of the decoded token and re-encode it. */
function flipBit(token: string, byte: number): string {
  const bytes = Buffer.from(token, 'base64url');
  bytes[byte] = (bytes[byte] as number) ^ 1;
  return bytes.toString('base64url');
}

describe('item references', () => {
  it('round-trips the item id for the user it was issued to', async () => {
    const token = await encryptItemRef(ref, NOW);
    expect(await decryptItemRef(token, 'user_1', NOW + 1000)).toEqual({
      ok: true,
      value: ref.itemId,
    });
  });

  it('never shows the item id and differs on every issue', async () => {
    const a = await encryptItemRef(ref, NOW);
    const b = await encryptItemRef(ref, NOW);
    expect(a).not.toBe(b);
    for (const token of [a, b]) {
      expect(token).not.toContain('schedule');
      expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('schedule');
    }
  });

  it('rejects a tampered token (IV, ciphertext or tag)', async () => {
    const token = await encryptItemRef(ref, NOW);
    const length = Buffer.from(token, 'base64url').length;
    for (const byte of [0, 20, length - 1]) {
      expect(await decryptItemRef(flipBit(token, byte), 'user_1', NOW)).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
  });

  it('rejects garbage and truncated tokens', async () => {
    const token = await encryptItemRef(ref, NOW);
    for (const bad of ['', 'abc', ref.itemId, token.slice(0, 20), token.slice(0, -4)]) {
      expect(await decryptItemRef(bad, 'user_1', NOW)).toEqual({ ok: false, error: 'INVALID' });
    }
  });

  it('rejects a token issued under another AUTH_SECRET', async () => {
    const token = await encryptItemRef(ref, NOW);
    vi.stubEnv('AUTH_SECRET', 'another-secret-of-16-chars');
    expect(await decryptItemRef(token, 'user_1', NOW)).toEqual({ ok: false, error: 'INVALID' });
  });

  it('rejects a token presented by another user', async () => {
    const token = await encryptItemRef(ref, NOW);
    expect(await decryptItemRef(token, 'user_2', NOW)).toEqual({
      ok: false,
      error: 'WRONG_USER',
    });
  });

  it('expires after 24 hours', async () => {
    const token = await encryptItemRef(ref, NOW);
    expect((await decryptItemRef(token, 'user_1', NOW + ITEM_REF_TTL_MS - 1)).ok).toBe(true);
    expect(await decryptItemRef(token, 'user_1', NOW + ITEM_REF_TTL_MS)).toEqual({
      ok: false,
      error: 'EXPIRED',
    });
  });

  it('refuses to issue a token without AUTH_SECRET', async () => {
    vi.stubEnv('AUTH_SECRET', '');
    await expect(encryptItemRef(ref, NOW)).rejects.toThrow('AUTH_SECRET');
  });
});
