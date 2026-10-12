import { buttonVariants } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function ExercisesPage() {
  const t = await getTranslations('student.exercises');

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-gray-600">{t('comingSoon')}</p>
      <Link href="/diagnostic" className={buttonVariants()}>
        {t('startDiagnostic')}
      </Link>
    </main>
  );
}
