import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from './register-form';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.register');
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Validated by the action (isSafeCallbackPath), not here. */}
          <RegisterForm callbackUrl={typeof callbackUrl === 'string' ? callbackUrl : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
