'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  type DiagnosticError,
  type DiagnosticStep,
  type DiagnosticSubmitOutcome,
  getDiagnosticStep,
  submitDiagnosticAnswer,
} from '@/lib/diagnostic';
import type { Result } from '@/lib/result';

export type DiagnosticActionError = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID' | DiagnosticError;

const Ids = {
  attemptId: z.string().min(1).max(200),
  position: z.number().int().min(0).max(15),
  itemId: z.string().min(1).max(200),
};
const SubmitSchema = z.union([
  z.object({ ...Ids, choiceIndex: z.number().int().min(0).max(5) }).strict(),
  z.object({ ...Ids, dontKnow: z.literal(true) }).strict(),
]);

/** The placement test is for learners; other roles never start an attempt. */
async function studentId(): Promise<Result<string, DiagnosticActionError>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'UNAUTHENTICATED' };
  if (session.user.role !== 'STUDENT') return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, value: session.user.id };
}

/** Start (Start button) or resume the signed-in learner's diagnostic. */
export async function startDiagnosticAction(): Promise<
  Result<DiagnosticStep, DiagnosticActionError>
> {
  const user = await studentId();
  if (!user.ok) return user;
  return getDiagnosticStep(user.value, new Date());
}

/**
 * Submit one answer (a choice or "I don't know"). The reply is the next step
 * only — never whether the answer was right: no feedback during the test.
 */
export async function submitDiagnosticAnswerAction(
  input: z.input<typeof SubmitSchema>,
): Promise<Result<DiagnosticSubmitOutcome, DiagnosticActionError>> {
  const user = await studentId();
  if (!user.ok) return user;
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  return submitDiagnosticAnswer(user.value, parsed.data, new Date());
}
