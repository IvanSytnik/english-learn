import { hash } from 'bcryptjs';
import type { PrismaClient } from './generated/client/client';

export const SEED_ADMIN_EMAIL = 'admin@englishlearn.dev';
export const SEED_STUDENT_EMAIL = 'student@englishlearn.dev';

/**
 * Fixed dev accounts (also the e2e logins). Upserts keyed on the unique email
 * with an empty update: re-running never duplicates a row and never resets a
 * password or profile that was changed since the first run.
 */
export async function seedUsers(db: PrismaClient) {
  const adminPassword = await hash('admin1234', 10);
  const studentPassword = await hash('student1234', 10);

  const admin = await db.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: adminPassword,
      locale: 'en',
    },
  });

  const student = await db.user.upsert({
    where: { email: SEED_STUDENT_EMAIL },
    update: {},
    create: {
      email: SEED_STUDENT_EMAIL,
      name: 'Student',
      role: 'STUDENT',
      passwordHash: studentPassword,
      locale: 'ru',
      profile: {
        create: {
          nativeLanguage: 'ru',
          selfReportedLevel: 'B1',
          goal: 'WORK',
        },
      },
    },
  });

  return { admin, student };
}
