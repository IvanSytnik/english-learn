import type { PrismaClient } from '../generated/client/client';
import { type NativeLanguage, NativeLanguageSchema } from '../schemas';

/**
 * Makes sure the user has a StudentProfile, creating an empty one if missing.
 *
 * Idempotent and race-free: a single `INSERT ... ON CONFLICT DO NOTHING` on the
 * unique `userId`, so concurrent calls never fail or duplicate. Registration
 * already creates the profile in the same insert as the user; this covers users
 * created before that, and future Auth.js adapter (OAuth) sign-ups that bypass
 * the registration action.
 *
 * Call it for STUDENT users only.
 */
export async function ensureStudentProfile(
  db: Pick<PrismaClient, 'studentProfile'>,
  userId: string,
): Promise<void> {
  await db.studentProfile.createMany({ data: [{ userId }], skipDuplicates: true });
}

/**
 * The stored native language, as is: `null` when the learner has not chosen
 * one (or has no profile yet) — never a default, never the interface locale.
 *
 * Not narrowed to `NativeLanguage`: a value written before the list existed,
 * or by hand, still means "already chosen". Callers that need a supported
 * language check it themselves.
 */
export async function getNativeLanguage(
  db: Pick<PrismaClient, 'studentProfile'>,
  userId: string,
): Promise<string | null> {
  const profile = await db.studentProfile.findUnique({
    where: { userId },
    select: { nativeLanguage: true },
  });
  return profile?.nativeLanguage ?? null;
}

/**
 * Store the learner's choice. The value is validated here, before anything is
 * written — an unknown string throws and leaves the profile untouched. A
 * missing profile is created first (`ensureStudentProfile`), so this never
 * fails with "record not found"; choosing again overwrites.
 */
export async function setNativeLanguage(
  db: Pick<PrismaClient, 'studentProfile'>,
  userId: string,
  language: NativeLanguage,
): Promise<void> {
  const nativeLanguage = NativeLanguageSchema.parse(language);
  await ensureStudentProfile(db, userId);
  await db.studentProfile.update({ where: { userId }, data: { nativeLanguage } });
}
