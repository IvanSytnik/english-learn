import 'server-only';
import type { Result } from '@/lib/result';
import { createSealedRef } from './sealed-ref';

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

const sealed = createSealedRef({
  salt: 'englishlearn/item-ref',
  info: 'item-ref v1 aes-256-gcm',
});

type Payload = { i: string; u: string; e: number };

/** A fresh token for `itemId`, valid for `userId` only, for 24 h. */
export async function encryptItemRef(
  { itemId, userId }: { itemId: string; userId: string },
  nowMs: number = Date.now(),
): Promise<string> {
  const payload: Payload = { i: itemId, u: userId, e: nowMs + ITEM_REF_TTL_MS };
  return sealed.seal(payload);
}

/** The item id behind `token`, if it was issued to `expectedUserId` and is still valid. */
export async function decryptItemRef(
  token: string,
  expectedUserId: string,
  nowMs: number = Date.now(),
): Promise<Result<string, ItemRefError>> {
  const payload = (await sealed.open(token)) as Partial<Payload> | null;
  if (payload === null || typeof payload.i !== 'string' || typeof payload.u !== 'string') {
    return { ok: false, error: 'INVALID' };
  }
  if (payload.u !== expectedUserId) return { ok: false, error: 'WRONG_USER' };
  if (!(nowMs < (payload.e as number))) return { ok: false, error: 'EXPIRED' };
  return { ok: true, value: payload.i };
}
