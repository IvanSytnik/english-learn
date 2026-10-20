import { prisma } from '@englishlearn/db';
import { ensureStudentProfile } from '@englishlearn/db/queries/student-profile';
import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';

export default async function DiagnosticPage() {
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale: await getLocale() });
  if (session.user.role === 'STUDENT') await ensureStudentProfile(prisma, session.user.id);

  const t = await getTranslations('student.diagnostic');

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-ink-muted">{t('comingSoon')}</p>
          {/* Until the diagnostic UI ships, the primary CTA leads to practice. */}
          <Link href="/exercises" className={buttonVariants()}>
            {t('goToPractice')}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
