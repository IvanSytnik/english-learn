import { isLocale } from '@englishlearn/db/schemas';
import { buttonVariants } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { loadNextExercise } from '@/lib/exercise/load';
import { SESSION_LENGTH } from '@/lib/exercise/view';
import { ExercisePlayer } from './exercise-player';

export default async function ExercisesPage() {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale });

  const first = await loadNextExercise({
    userId: session.user.id,
    locale: isLocale(locale) ? locale : 'en',
  });

  if (first) return <ExercisePlayer initial={first} sessionLength={SESSION_LENGTH} />;

  // Nothing selectable (no published practice items, or everything gated):
  // point the learner at the diagnostic instead of an empty player.
  const t = await getTranslations('student.exercises');
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-ink-muted">{t('comingSoon')}</p>
      <Link href="/diagnostic" className={buttonVariants()}>
        {t('startDiagnostic')}
      </Link>
    </main>
  );
}
