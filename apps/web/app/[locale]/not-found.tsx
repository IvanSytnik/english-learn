import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-ink-muted">{t('description')}</p>
      <Link href="/" className="font-medium text-accent underline underline-offset-4">
        {t('home')}
      </Link>
    </main>
  );
}
