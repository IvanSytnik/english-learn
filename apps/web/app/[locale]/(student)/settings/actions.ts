'use server';

import { prisma } from '@englishlearn/db';
import { setNativeLanguage } from '@englishlearn/db/queries/student-profile';
import { getUserExportData, type UserExportPayload } from '@englishlearn/db/queries/user-export';
import { NativeLanguageSchema } from '@englishlearn/db/schemas';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { auth, signOut } from '@/lib/auth';
import { deletePasswordResetTokens } from '@/lib/auth/password-reset';
import { withinAuthLimits } from '@/lib/auth/rate-limit';
import type { Result } from '@/lib/result';

export type UpdateNativeLanguageError = 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
export type ExportUserDataError = 'UNAUTHORIZED' | 'INTERNAL_ERROR';
export type DeleteAccountError =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'INVALID_PASSWORD'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const LanguageInputSchema = z.object({ language: NativeLanguageSchema });
// Long enough for any password registration accepts; bounded so bcrypt never sees a megabyte.
const DeleteInputSchema = z.object({ password: z.string().min(1).max(1024) });

/**
 * Change the native language the hint and "why" are shown in. Students only:
 * it lives on the StudentProfile, which other roles do not have.
 */
export async function updateNativeLanguageAction(
  input: unknown,
): Promise<Result<{ success: true }, UpdateNativeLanguageError>> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'STUDENT') {
    return { ok: false, error: 'UNAUTHORIZED' };
  }
  const parsed = LanguageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };
  try {
    await setNativeLanguage(prisma, session.user.id, parsed.data.language);
  } catch (err) {
    console.error('updateNativeLanguage failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
  return { ok: true, value: { success: true } };
}

/** Everything stored about the signed-in user (GDPR Art. 15 / 20), without the password hash. */
export async function exportUserDataAction(): Promise<
  Result<UserExportPayload, ExportUserDataError>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHORIZED' };
  try {
    const payload = await getUserExportData(prisma, session.user.id);
    // Deleted since the session was issued.
    if (!payload) return { ok: false, error: 'UNAUTHORIZED' };
    return { ok: true, value: payload };
  } catch (err) {
    console.error('exportUserData failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete the signed-in user's account and everything hanging off it (every
 * relation cascades; authored content keeps its row with the author set to
 * NULL). The current password must be given: a session left open on a shared
 * computer is not enough. Attempts are throttled per user. Pending reset
 * links for the address go in the same transaction. Sessions on other
 * devices die on their next request — the JWT check finds no user.
 */
export async function deleteAccountAction(
  input: unknown,
): Promise<Result<{ success: true }, DeleteAccountError>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHORIZED' };
  const userId = session.user.id;
  const parsed = DeleteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };

  try {
    if (!(await withinAuthLimits([['delete:user', userId]]))) {
      return { ok: false, error: 'RATE_LIMITED' };
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user) return { ok: false, error: 'UNAUTHORIZED' };
    // No password to check (an OAuth-only account): nothing can prove it.
    if (!user.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) {
      return { ok: false, error: 'INVALID_PASSWORD' };
    }
    await prisma.$transaction([
      deletePasswordResetTokens(prisma, user.email),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  } catch (err) {
    console.error('deleteAccount failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }

  try {
    await signOut({ redirect: false });
  } catch (err) {
    // The account is gone either way; the leftover cookie is refused on its next use.
    console.error('signOut after account deletion failed', err);
  }
  return { ok: true, value: { success: true } };
}
