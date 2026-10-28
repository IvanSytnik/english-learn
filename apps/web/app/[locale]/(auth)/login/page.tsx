import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.login');
  const { callbackUrl, reset } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Validated by the action (isSafeCallbackPath), not here. */}
          <LoginForm
            callbackUrl={typeof callbackUrl === 'string' ? callbackUrl : undefined}
            passwordReset={reset === '1'}
          />
        </CardContent>
      </Card>
    </main>
  );
}
