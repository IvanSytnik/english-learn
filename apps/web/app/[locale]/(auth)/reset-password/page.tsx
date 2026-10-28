import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ResetPasswordForm } from './reset-password-form';

// The URL carries a live token: never send it on in a Referer.
export const metadata: Metadata = { referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.reset');
  const { token, email } = await searchParams;
  // Checked by the action; here only "is there a link at all".
  const complete = typeof token === 'string' && token && typeof email === 'string' && email;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {complete ? (
            <ResetPasswordForm token={token} email={email} />
          ) : (
            <div className="space-y-4 text-sm">
              <p role="alert">{t('invalidLink')}</p>
              <Link
                href="/forgot-password"
                className="font-medium text-accent underline underline-offset-4"
              >
                {t('requestNew')}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
