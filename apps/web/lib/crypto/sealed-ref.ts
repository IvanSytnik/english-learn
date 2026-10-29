import 'server-only';
import { webcrypto } from 'node:crypto';

type CryptoKey = webcrypto.CryptoKey;

/**
 * AES-256-GCM sealing of small JSON payloads the client only echoes back
 * (item-ref.ts, vocab-ref.ts). The key is derived from AUTH_SECRET with HKDF;
 * each kind of reference has its own salt and info, so a token of one kind
 * never opens as another (domain separation), and rotating the secret
 * invalidates every outstanding token.
 *
 * Token = base64url(iv ‖ ciphertext ‖ tag). Opening checks integrity only —
 * the caller validates the payload's shape, owner and expiry.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SealedRefDomain = { salt: string; info: string };

export function createSealedRef(domain: SealedRefDomain) {
  const salt = new TextEncoder().encode(domain.salt);
  const info = new TextEncoder().encode(domain.info);
  let cached: { secret: string; key: Promise<CryptoKey> } | null = null;

  function key(): Promise<CryptoKey> {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET is not set');
    if (cached === null || cached.secret !== secret) {
      const subtle = webcrypto.subtle;
      const derived = subtle
        .importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey'])
        .then((ikm) =>
          subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt, info },
            ikm,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
          ),
        );
      cached = { secret, key: derived };
    }
    return cached.key;
  }

  return {
    /** A fresh token for `payload` (a new random IV every time). */
    async seal(payload: unknown): Promise<string> {
      const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
      const sealed = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await key(),
        new TextEncoder().encode(JSON.stringify(payload)),
      );
      return Buffer.concat([iv, new Uint8Array(sealed)]).toString('base64url');
    },

    /** The payload behind `token`, or null if it is not one this domain sealed. */
    async open(token: string): Promise<unknown | null> {
      const bytes = Buffer.from(token, 'base64url');
      if (bytes.length <= IV_BYTES + TAG_BYTES) return null;
      try {
        const plain = await webcrypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
          await key(),
          bytes.subarray(IV_BYTES),
        );
        return JSON.parse(new TextDecoder().decode(plain)) as unknown;
      } catch {
        return null;
      }
    },
  };
}
