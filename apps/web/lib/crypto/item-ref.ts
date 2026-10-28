import 'server-only';
import { webcrypto } from 'node:crypto';
import type { Result } from '@/lib/result';

type CryptoKey = webcrypto.CryptoKey;

/**
 * Opaque, per-user references to items for the client.
 *
 * Item ids carry what the learner must not see before answering: exercise ids
 * name the answer (`item.vocab.daily_life.schedule`), diagnostic ids the
 * question's level (`seed-diag-grammar-b1-03`). The client gets an
 * AES-256-GCM token instead and only ever echoes it back; the server decrypts
 * it and checks that it was issued to the same user and is not expired.
 *
 * The key is derived from AUTH_SECRET with HKDF, so rotating the secret
 * invalidates every outstanding reference (a reload issues fresh ones).
 */

export const ITEM_REF_TTL_MS = 24 * 60 * 60 * 1000;

export type ItemRefError =
  /** Not a token we issued: garbage, truncated or tampered with. */
  | 'INVALID'
  | 'EXPIRED'
  /** Issued to someone else. */
  | 'WRONG_USER';

const IV_BYTES = 12;
const HKDF_SALT = new TextEncoder().encode('englishlearn/item-ref');
const HKDF_INFO = new TextEncoder().encode('item-ref v1 aes-256-gcm');

type Payload = { i: string; u: string; e: number };

let cached: { secret: string; key: Promise<CryptoKey> } | null = null;

function itemRefKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  if (cached === null || cached.secret !== secret) {
    const subtle = webcrypto.subtle;
    const key = subtle
      .importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey'])
      .then((ikm) =>
        subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
          ikm,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    cached = { secret, key };
  }
  return cached.key;
}

/** A fresh token for `itemId`, valid for `userId` only, for 24 h. */
export async function encryptItemRef(
  { itemId, userId }: { itemId: string; userId: string },
  nowMs: number = Date.now(),
): Promise<string> {
  const payload: Payload = { i: itemId, u: userId, e: nowMs + ITEM_REF_TTL_MS };
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await itemRefKey(),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return Buffer.concat([iv, new Uint8Array(sealed)]).toString('base64url');
}

/** The item id behind `token`, if it was issued to `expectedUserId` and is still valid. */
export async function decryptItemRef(
  token: string,
  expectedUserId: string,
  nowMs: number = Date.now(),
): Promise<Result<string, ItemRefError>> {
  const bytes = Buffer.from(token, 'base64url');
  // GCM tag is 16 bytes; anything shorter cannot be ours.
  if (bytes.length <= IV_BYTES + 16) return { ok: false, error: 'INVALID' };

  let payload: Payload;
  try {
    const plain = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
      await itemRefKey(),
      bytes.subarray(IV_BYTES),
    );
    payload = JSON.parse(new TextDecoder().decode(plain)) as Payload;
  } catch {
    return { ok: false, error: 'INVALID' };
  }
  if (typeof payload.i !== 'string' || typeof payload.u !== 'string') {
    return { ok: false, error: 'INVALID' };
  }
  if (payload.u !== expectedUserId) return { ok: false, error: 'WRONG_USER' };
  if (!(nowMs < payload.e)) return { ok: false, error: 'EXPIRED' };
  return { ok: true, value: payload.i };
}
