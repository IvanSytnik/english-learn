import 'server-only';
import { VOCAB_MODES, type VocabLocale, type VocabMode } from '@englishlearn/learner-model';
import { z } from 'zod';
import type { Result } from '@/lib/result';
import { createSealedRef } from './sealed-ref';

/**
 * Opaque, per-user reference to one served vocabulary card (B2.6).
 *
 * Everything the server needs to grade exactly the card that was shown, none
 * of which the learner may see before answering: the item, the mode served
 * (after the cloze fallback), whether it is a "Know -> prove" check, the
 * review state the card was built for (`lastReviewAt` — its seed and the
 * write path's staleness check), the content language, and for choice modes
 * the correct index — so a pool refresh after vocab:publish cannot shift the
 * grading of a card already on screen. AES-256-GCM keeps it confidential;
 * its own HKDF domain keeps an item-ref from ever opening here.
 */

export const VOCAB_REF_TTL_MS = 24 * 60 * 60 * 1000;

export type VocabRefError =
  /** Not a token we issued: garbage, truncated, tampered with or another kind. */
  | 'INVALID'
  | 'EXPIRED'
  /** Issued to someone else. */
  | 'WRONG_USER';

export type VocabRef = {
  itemId: string;
  mode: VocabMode;
  isProof: boolean;
  /** ItemReviewState.lastReviewAt the card was built for; null = never answered. */
  lastReviewAt: bigint | null;
  locale: VocabLocale;
  /** Choice modes: index of the right option; null for recall. */
  correctIndex: number | null;
};

export const VOCAB_REF_DOMAIN = {
  salt: 'englishlearn/vocab-ref',
  info: 'vocab-ref v1 aes-256-gcm',
} as const;

const sealed = createSealedRef(VOCAB_REF_DOMAIN);

const PayloadSchema = z
  .object({
    u: z.string().min(1),
    i: z.string().min(1),
    m: z.enum(VOCAB_MODES),
    p: z.boolean(),
    /** bigint as a decimal string (JSON has no bigint). */
    r: z.string().regex(/^\d+$/).nullable(),
    l: z.enum(['ru', 'uk', 'de', 'en']),
    k: z.number().int().min(0).max(3).nullable(),
    e: z.number(),
  })
  .strict();
type Payload = z.infer<typeof PayloadSchema>;

/** A fresh token for one served card, valid for `userId` only, for 24 h. */
export async function encryptVocabRef(
  ref: VocabRef & { userId: string },
  nowMs: number = Date.now(),
): Promise<string> {
  const payload: Payload = {
    u: ref.userId,
    i: ref.itemId,
    m: ref.mode,
    p: ref.isProof,
    r: ref.lastReviewAt === null ? null : ref.lastReviewAt.toString(),
    l: ref.locale,
    k: ref.correctIndex,
    e: nowMs + VOCAB_REF_TTL_MS,
  };
  return sealed.seal(payload);
}

/** The card behind `token`, if it was issued to `expectedUserId` and is still valid. */
export async function decryptVocabRef(
  token: string,
  expectedUserId: string,
  nowMs: number = Date.now(),
): Promise<Result<VocabRef, VocabRefError>> {
  const parsed = PayloadSchema.safeParse(await sealed.open(token));
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const p = parsed.data;
  if (p.u !== expectedUserId) return { ok: false, error: 'WRONG_USER' };
  if (!(nowMs < p.e)) return { ok: false, error: 'EXPIRED' };
  return {
    ok: true,
    value: {
      itemId: p.i,
      mode: p.m,
      isProof: p.p,
      lastReviewAt: p.r === null ? null : BigInt(p.r),
      locale: p.l,
      correctIndex: p.k,
    },
  };
}
