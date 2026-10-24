import { prisma } from '@englishlearn/db';
import { Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth, signOut } from '@/lib/auth';
import { isDiagnosticDone } from '@/lib/diagnostic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale: await getLocale() });

  const t = await getTranslations('student.dashboard');
  const tc = await getTranslations('common');

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  });
  // A learner without a diagnostic yet is sent to find their level first.
  // Read-only: GET /dashboard never writes.
  const needsDiagnostic =
    session.user.role === 'STUDENT' && !(await isDiagnosticDone(session.user.id));

  async function logout() {
    'use server';
    await signOut({ redirect: false });
    redirect({ href: '/', locale: await getLocale() });
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <form action={logout}>
          <Button variant="ghost" type="submit">
            {tc('signOut')}
          </Button>
        </form>
      </header>

      <p className="mb-6 text-ink-muted">{t('welcome', { name: session.user.name ?? 'friend' })}</p>

      {profile?.assessedLevel ? (
        <p className="mb-6">{t('level', { level: profile.assessedLevel })}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{needsDiagnostic ? t('findLevel') : t('startPractice')}</CardTitle>
        </CardHeader>
        <CardContent>
          {needsDiagnostic ? (
            // No prefetch: rendering /diagnostic for a finished attempt writes
            // (ensureBootstrapped), so it must run only when the learner clicks.
            <Link href="/diagnostic" prefetch={false} className={buttonVariants()}>
              {t('findLevel')}
            </Link>
          ) : (
            <Link href="/exercises" className={buttonVariants()}>
              {t('startPractice')}
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
