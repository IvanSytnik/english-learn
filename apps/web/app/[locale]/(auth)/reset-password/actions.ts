'use server';

import { prisma } from '@englishlearn/db';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { verifyAndConsumePasswordResetToken } from '@/lib/auth/password-reset';
import type { Result } from '@/lib/result';

// Same bounds as sign-up (register/actions.ts).
const resetSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'PASSWORD_TOO_SHORT').max(120, 'PASSWORD_TOO_LONG'),
});

export type ResetPasswordError =
  | 'INVALID_TOKEN'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'FAILED';
export type ResetPasswordResult = Result<{ success: true }, ResetPasswordError>;

/**
 * Set a new password from a reset link. The token is consumed and the password
 * written in one transaction, so a failed write leaves the link usable.
 * `passwordChangedAt` revokes every session signed before it
 * (lib/auth/session-revocation.ts). The user is not signed in here.
 */
export async function resetPasswordAction(input: {
  token: unknown;
  email: unknown;
  password: unknown;
}): Promise<ResetPasswordResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    const password = parsed.error.issues.find((i) => i.path[0] === 'password');
    if (password && parsed.error.issues.length === 1) {
      return { ok: false, error: password.message as ResetPasswordError };
    }
    return { ok: false, error: 'INVALID_TOKEN' };
  }
  const { token, email, password } = parsed.data;

  try {
    // Hashed before the transaction: bcrypt must not hold a connection open.
    const passwordHash = await hash(password, 10);
    const updated = await prisma.$transaction(async (tx) => {
      if (!(await verifyAndConsumePasswordResetToken(tx, { email, token }))) return false;
      const { count } = await tx.user.updateMany({
        where: { email },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      return count === 1;
    });
    if (!updated) return { ok: false, error: 'INVALID_TOKEN' };
  } catch (err) {
    console.error('resetPasswordAction failed', err);
    return { ok: false, error: 'FAILED' };
  }
  return { ok: true, value: { success: true } };
}
