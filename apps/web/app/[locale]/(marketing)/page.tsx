import { Button } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function MarketingPage() {
  const t = await getTranslations('marketing.hero');
  const tc = await getTranslations('common');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t('title')}</h1>
      <p className="mt-6 text-lg text-gray-600">{t('subtitle')}</p>
      <div className="mt-10 flex gap-4">
        <Link href="/register">
          <Button size="lg">{t('cta')}</Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="ghost">
            {tc('signIn')}
          </Button>
        </Link>
      </div>
    </main>
  );
}
