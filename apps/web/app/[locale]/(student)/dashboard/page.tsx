import { prisma } from '@englishlearn/db';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth, signOut } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const t = await getTranslations('student.dashboard');
  const tc = await getTranslations('common');

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  });

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/' });
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

      <p className="mb-6 text-gray-600">{t('welcome', { name: session.user.name ?? 'friend' })}</p>

      {profile?.assessedLevel ? (
        <p className="mb-6">{t('level', { level: profile.assessedLevel })}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('takeDiagnostic')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/diagnostic">
              <Button>{t('takeDiagnostic')}</Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('nextExercise')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/exercises">
              <Button variant="secondary">{t('nextExercise')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
