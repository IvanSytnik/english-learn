import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from './forgot-password-form';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
