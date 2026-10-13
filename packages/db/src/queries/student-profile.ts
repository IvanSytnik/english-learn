import type { PrismaClient } from '../generated/client/client';

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
