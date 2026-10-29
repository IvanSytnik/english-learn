import { prisma } from '@englishlearn/db';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import { isNativeLanguage } from '@englishlearn/db/schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { DeleteAccount } from './delete-account';
import { ExportData } from './export-data';
import { LanguageForm } from './language-form';

export default async function SettingsPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) return redirect({ href: '/login', locale });

  const t = await getTranslations('settings');
  // The native language lives on the StudentProfile, which only students have.
  const isStudent = session.user.role === 'STUDENT';
  const stored = isStudent ? await getNativeLanguage(prisma, session.user.id) : null;

  return (
    <>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-bold text-ink">{t('title')}</h1>
          <Link href="/dashboard" className="text-sm text-ink-muted underline">
            {t('backToDashboard')}
          </Link>
        </header>

        {isStudent ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <span id="settings-language-title">{t('language.title')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageForm initial={isNativeLanguage(stored) ? stored : null} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('export.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExportData />
          </CardContent>
        </Card>

        <Card className="border-feedback-incorrect">
          <CardHeader>
            <CardTitle>{t('dangerZone.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DeleteAccount />
          </CardContent>
        </Card>
      </main>
      <Footer />
    </>
  );
}
