'use server';

import { prisma } from '@englishlearn/db';
import { getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import { createBetaFeedback } from '@englishlearn/db/queries/feedback';
import { CreateBetaFeedbackSchema, type VocabFeedbackMetadata } from '@englishlearn/db/schemas';
import { PAYLOAD_MODE } from '@englishlearn/learner-model';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { decryptItemRef } from '@/lib/crypto/item-ref';
import { decryptVocabRef } from '@/lib/crypto/vocab-ref';
import type { Result } from '@/lib/result';
import { getVocabPool } from '@/lib/vocab-pool';

export type FeedbackErrorCode = 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

/**
 * A report from a player names its item by the opaque reference it was shown:
 * `itemRef` from the exercise player, `vocabRef` from the vocabulary player —
 * never both.
 */
const RefSchema = z
  .object({
    itemRef: z.string().min(1).max(1024).optional(),
    vocabRef: z.string().min(1).max(1024).optional(),
  })
  .refine((r) => r.itemRef === undefined || r.vocabRef === undefined);

/**
 * Store a beta feedback report from the signed-in user. The author is always
 * the session's user — the input has no say in it. A report sent with an
 * `itemRef` is stored against the item it decrypts to (and that item's
 * concept), never against ids the client names; a reference that is not the
 * user's, expired or forged is refused. A `vocabRef` report also gets the
 * word's context in `metadata` (lexeme, lemma, practice mode), built here —
 * whatever metadata the client sent is dropped. Database errors are logged
 * here and never reach the client.
 */
export async function submitBetaFeedbackAction(
  input: unknown,
): Promise<Result<void, FeedbackErrorCode>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHORIZED' };
  const userId = session.user.id;
  const parsed = CreateBetaFeedbackSchema.safeParse(input);
  const ref = RefSchema.safeParse(input);
  if (!parsed.success || !ref.success) return { ok: false, error: 'VALIDATION_ERROR' };

  let refItemId: string | null = null;
  if (ref.data.itemRef !== undefined) {
    const decrypted = await decryptItemRef(ref.data.itemRef, userId);
    if (!decrypted.ok) return { ok: false, error: 'VALIDATION_ERROR' };
    refItemId = decrypted.value;
  }
  let vocab: { itemId: string; mode: keyof typeof PAYLOAD_MODE } | null = null;
  if (ref.data.vocabRef !== undefined) {
    const decrypted = await decryptVocabRef(ref.data.vocabRef, userId);
    if (!decrypted.ok) return { ok: false, error: 'VALIDATION_ERROR' };
    vocab = { itemId: decrypted.value.itemId, mode: decrypted.value.mode };
  }

  try {
    let data = parsed.data;
    if (refItemId !== null) {
      data = {
        ...data,
        itemId: refItemId,
        // Unpublished since it was shown: still worth a report, without a concept.
        conceptId: (await getPublishedPracticeItem(refItemId))?.concept.id ?? null,
      };
    }
    if (vocab !== null) {
      const word = (await getVocabPool()).byItemId.get(vocab.itemId);
      const metadata: VocabFeedbackMetadata | null = word
        ? { lexemeId: word.id, lemma: word.lemma, vocabMode: PAYLOAD_MODE[vocab.mode] }
        : null;
      data = {
        ...data,
        itemId: vocab.itemId,
        // Unpublished since it was shown: still a report, without its context.
        conceptId: word?.conceptId ?? null,
        metadata,
      };
    }
    await createBetaFeedback(prisma, { ...data, userId });
  } catch (err) {
    console.error('submitBetaFeedback failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
  return { ok: true, value: undefined };
}
