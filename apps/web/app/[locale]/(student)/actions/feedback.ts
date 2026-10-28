'use server';

import { prisma } from '@englishlearn/db';
import { getPublishedPracticeItem } from '@englishlearn/db/queries/exercises';
import { createBetaFeedback } from '@englishlearn/db/queries/feedback';
import { CreateBetaFeedbackSchema } from '@englishlearn/db/schemas';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { decryptItemRef } from '@/lib/crypto/item-ref';
import type { Result } from '@/lib/result';

export type FeedbackErrorCode = 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

/** A report from the player names its item by the opaque reference it was shown. */
const ItemRefSchema = z.object({ itemRef: z.string().min(1).max(1024).optional() });

/**
 * Store a beta feedback report from the signed-in user. The author is always
 * the session's user — the input has no say in it. A report sent with an
 * `itemRef` is stored against the item it decrypts to (and that item's
 * concept), never against ids the client names; a reference that is not the
 * user's, expired or forged is refused. Database errors are logged here and
 * never reach the client.
 */
export async function submitBetaFeedbackAction(
  input: unknown,
): Promise<Result<void, FeedbackErrorCode>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHORIZED' };
  const userId = session.user.id;
  const parsed = CreateBetaFeedbackSchema.safeParse(input);
  const ref = ItemRefSchema.safeParse(input);
  if (!parsed.success || !ref.success) return { ok: false, error: 'VALIDATION_ERROR' };

  let refItemId: string | null = null;
  if (ref.data.itemRef !== undefined) {
    const decrypted = await decryptItemRef(ref.data.itemRef, userId);
    if (!decrypted.ok) return { ok: false, error: 'VALIDATION_ERROR' };
    refItemId = decrypted.value;
  }

  try {
    const data =
      refItemId === null
        ? parsed.data
        : {
            ...parsed.data,
            itemId: refItemId,
            // Unpublished since it was shown: still worth a report, without a concept.
            conceptId: (await getPublishedPracticeItem(refItemId))?.concept.id ?? null,
          };
    await createBetaFeedback(prisma, { ...data, userId });
  } catch (err) {
    console.error('submitBetaFeedback failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
  return { ok: true, value: undefined };
}
