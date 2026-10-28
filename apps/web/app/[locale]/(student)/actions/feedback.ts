'use server';

import { prisma } from '@englishlearn/db';
import { createBetaFeedback } from '@englishlearn/db/queries/feedback';
import { CreateBetaFeedbackSchema } from '@englishlearn/db/schemas';
import { auth } from '@/lib/auth';
import type { Result } from '@/lib/result';

export type FeedbackErrorCode = 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

/**
 * Store a beta feedback report from the signed-in user. The author is always
 * the session's user — the input has no say in it. Database errors are logged
 * here and never reach the client.
 */
export async function submitBetaFeedbackAction(
  input: unknown,
): Promise<Result<void, FeedbackErrorCode>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHORIZED' };
  const parsed = CreateBetaFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };
  try {
    await createBetaFeedback(prisma, { ...parsed.data, userId: session.user.id });
  } catch (err) {
    console.error('submitBetaFeedback failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
  return { ok: true, value: undefined };
}
