import { isLocale } from '@englishlearn/db/schemas';
import { buttonVariants, SessionLengthPicker } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { isDiagnosticDone } from '@/lib/diagnostic';
import { exercisesFallback } from '@/lib/exercise/fallback';
import { loadNextExercise } from '@/lib/exercise/load';
import {
  DEFAULT_SESSION_MINUTES,
  parseSessionMinutes,
  SESSION_ITEMS,
  SESSION_MINUTES,
} from '@/lib/exercise/view';
import { ExercisePlayer } from './exercise-player';

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale });

  // No valid length yet (missing, unknown or repeated ?minutes=): ask first.
  const minutes = parseSessionMinutes((await searchParams).minutes);
  if (minutes === null) {
    const t = await getTranslations('learning.sessionLength');
    return (
      <main className="mx-auto w-full max-w-[62ch] px-4 py-12">
        <SessionLengthPicker
          legend={t('title')}
          options={SESSION_MINUTES.map((m) => ({
            minutes: m,
            label: t('option', { minutes: m }),
            detail: t('items', { count: SESSION_ITEMS[m] }),
          }))}
          defaultMinutes={DEFAULT_SESSION_MINUTES}
          startLabel={t('start')}
        />
      </main>
    );
  }

  const first = await loadNextExercise({
    userId: session.user.id,
    locale: isLocale(locale) ? locale : 'en',
  });

  if (first) return <ExercisePlayer initial={first} sessionLength={SESSION_ITEMS[minutes]} />;

  // Nothing selectable (no published practice items, or everything gated).
  // Before the diagnostic: point the learner at it. After it, the diagnostic
  // only shows the result and leads back here — so say so instead of looping.
  const t = await getTranslations('student.exercises');
  const fallback = exercisesFallback(await isDiagnosticDone(session.user.id));
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-ink-muted">{t(fallback.text)}</p>
      {fallback.href === '/diagnostic' ? (
        // No prefetch: /diagnostic may write for a finished attempt.
        <Link href="/diagnostic" prefetch={false} className={buttonVariants()}>
          {t(fallback.cta)}
        </Link>
      ) : (
        <Link href="/dashboard" className={buttonVariants()}>
          {t(fallback.cta)}
        </Link>
      )}
    </main>
  );
}
