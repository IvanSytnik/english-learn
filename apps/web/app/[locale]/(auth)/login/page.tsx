import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { signIn } from '@/lib/auth';

export default async function LoginPage() {
  const t = await getTranslations('auth.login');

  async function login(formData: FormData) {
    'use server';
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                {t('email')}
              </label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">
                {t('password')}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full">
              {t('submit')}
            </Button>
            <p className="text-center text-sm text-gray-600">
              {t('noAccount')}{' '}
              <Link href="/register" className="font-medium text-blue-600 hover:underline">
                {t('signUp')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
