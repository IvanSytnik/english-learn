import { prisma } from '@englishlearn/db';
import { Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth, signOut } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale: await getLocale() });

  const t = await getTranslations('student.dashboard');
  const tc = await getTranslations('common');

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  });

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
          <CardTitle>{t('startPractice')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Until the diagnostic UI ships, the primary CTA leads to practice. */}
          <Link href="/exercises" className={buttonVariants()}>
            {t('startPractice')}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
