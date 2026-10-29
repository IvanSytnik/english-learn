'use server';

import { prisma } from '@englishlearn/db';
import { setDailyVocabLimit } from '@englishlearn/db/queries/vocab-session';
import { DailyVocabLimitSchema, isLocale } from '@englishlearn/db/schemas';
import { parseVocabConceptId } from '@englishlearn/db/vocab/topics';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { authorizeAction } from '@/lib/authz';
import { decryptVocabRef } from '@/lib/crypto/vocab-ref';
import { RECENT_EXCLUDE } from '@/lib/exercise/view';
import type { Result } from '@/lib/result';
import {
  loadNextVocabCard,
  type NextVocabCard,
  startVocabProof,
  submitVocabAttempt,
  type VocabCardPayload,
  type VocabSubmitOutcome,
} from '@/lib/vocab-session';

/**
 * The vocabulary session's server actions (B2.6). Learners only (S5): every
 * action writes to or reads from the learner model. Inputs are parsed here;
 * the session logic and its guarantees live in lib/vocab-session.ts. The
 * client names words only by the opaque vocabRef it was given (Axiom 3).
 */

export type VocabActionError =
  | 'UNAUTHENTICATED'
  /** Signed in, but not a learner. */
  | 'FORBIDDEN'
  | 'INVALID'
  | 'NOT_FOUND'
  /** Something failed on the server; the cause is in the server log. */
  | 'UNAVAILABLE';

/** An opaque card reference (`lib/crypto/vocab-ref.ts`), never a raw id. */
const VocabRefSchema = z.string().min(1).max(1024);
/** The client's IANA zone; the session validates it (invalid → UTC). */
const TimeZoneSchema = z.string().max(64).optional();

const NextSchema = z.object({
  /** A topic session: one topic concept (`vocab.<topic>.<level>`). */
  conceptId: z
    .string()
    .max(100)
    .refine((id) => parseVocabConceptId(id) !== null)
    .optional(),
  /** Cards just shown, so a just-failed word is not served straight back. */
  recentVocabRefs: z.array(VocabRefSchema).max(20).optional(),
  timeZone: TimeZoneSchema,
});

const ProofSchema = z.object({ vocabRef: VocabRefSchema });

const SubmitSchema = z.object({
  vocabRef: VocabRefSchema,
  answer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('choice'), index: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('text'), value: z.string().max(200) }),
    z.object({ type: z.literal('dontKnow') }),
  ]),
  /** The hint was opened at least once on this card. */
  hinted: z.boolean().optional(),
  /** Time from showing the card to answering; dropped if implausible. */
  timeMs: z.number().int().positive().max(3_600_000).optional(),
  /** One per card shown, reused by every resend of it (and after a synonym retry). */
  attemptKey: z.uuid().optional(),
});

const LimitSchema = z.object({ dailyVocabLimit: DailyVocabLimitSchema });

async function currentLocale() {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'en';
}

/** Unexpected failures stay on the server; the client gets a retryable code. */
async function guarded<T>(
  name: string,
  run: () => Promise<Result<T, VocabActionError>>,
): Promise<Result<T, VocabActionError>> {
  try {
    return await run();
  } catch (err) {
    console.error(`${name} failed`, err);
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** The next card for the signed-in learner, or "done" with the next due moment. */
export async function nextVocabCardAction(
  input: z.input<typeof NextSchema>,
): Promise<Result<NextVocabCard, VocabActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const userId = user.value.id;
  const parsed = NextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const { conceptId, recentVocabRefs = [], timeZone } = parsed.data;

  return guarded('nextVocabCard', async () => {
    // The recent list only steers selection: a ref that does not decrypt for
    // this learner (expired, foreign, forged) is dropped, not an error.
    const recent = await Promise.all(
      recentVocabRefs.slice(-RECENT_EXCLUDE).map((ref) => decryptVocabRef(ref, userId)),
    );
    return loadNextVocabCard({
      userId,
      uiLocale: await currentLocale(),
      timeZone,
      conceptId,
      excludeItemIds: recent.flatMap((r) => (r.ok ? [r.value.itemId] : [])),
    });
  });
}

/** "I know this word": the one cued recall check that proves it. */
export async function startVocabProofAction(
  input: z.input<typeof ProofSchema>,
): Promise<Result<VocabCardPayload | { status: 'stale' }, VocabActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = ProofSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  return guarded('startVocabProof', () =>
    startVocabProof({ userId: user.value.id, vocabRef: parsed.data.vocabRef }),
  );
}

/** Grade one answer on the server and record it through recordVocabOutcome. */
export async function submitVocabAttemptAction(
  input: z.input<typeof SubmitSchema>,
): Promise<Result<VocabSubmitOutcome, VocabActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  return guarded('submitVocabAttempt', () =>
    submitVocabAttempt({ userId: user.value.id, ...parsed.data }),
  );
}

/** New words per day, 1..50 (StudentProfile.dailyVocabLimit). */
export async function updateDailyVocabLimitAction(
  input: z.input<typeof LimitSchema>,
): Promise<Result<{ dailyVocabLimit: number }, VocabActionError>> {
  const user = await authorizeAction('STUDENT');
  if (!user.ok) return user;
  const parsed = LimitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const { dailyVocabLimit } = parsed.data;
  return guarded('updateDailyVocabLimit', async () => {
    await setDailyVocabLimit(prisma, user.value.id, dailyVocabLimit);
    return { ok: true, value: { dailyVocabLimit } };
  });
}
