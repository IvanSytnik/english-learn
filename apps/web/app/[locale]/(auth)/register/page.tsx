import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { registerUser } from './actions';

export default async function RegisterPage() {
  const t = await getTranslations('auth.register');

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
<form action={registerUser as unknown as (formData: FormData) => void} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                {t('name')}
              </label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
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
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full">
              {t('submit')}
            </Button>
            <p className="text-center text-sm text-gray-600">
              {t('hasAccount')}{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                {t('signIn')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
