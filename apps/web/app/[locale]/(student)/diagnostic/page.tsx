import { prisma } from '@englishlearn/db';
import { ensureStudentProfile } from '@englishlearn/db/queries/student-profile';
import { isLocale } from '@englishlearn/db/schemas';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { peekDiagnosticStep } from '@/lib/diagnostic';
import { DiagnosticFlow, type DiagnosticView } from './diagnostic-flow';

/**
 * /diagnostic: the intro, the question the learner left off at (resume after
 * a reload), or the result. Opening the page never starts an attempt — the
 * Start button does.
 */
export default async function DiagnosticPage() {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale });

  let initial: DiagnosticView = { kind: 'unavailable' };
  // The placement test is for learners; other roles see "unavailable".
  if (session.user.role === 'STUDENT') {
    await ensureStudentProfile(prisma, session.user.id);
    try {
      const step = await peekDiagnosticStep(
        session.user.id,
        new Date(),
        isLocale(locale) ? locale : 'en',
      );
      if (step.ok) initial = step.value;
      else console.error(`[diagnostic] page: ${step.error}`);
    } catch (e) {
      console.error('[diagnostic] page failed', e);
    }
  }

  return <DiagnosticFlow initial={initial} />;
}
