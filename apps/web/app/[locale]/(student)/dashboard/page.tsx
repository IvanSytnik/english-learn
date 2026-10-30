import { isLocale } from '@englishlearn/db/schemas';
import { Button, buttonVariants } from '@englishlearn/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link, redirect } from '@/i18n/navigation';
import { auth, signOut } from '@/lib/auth';
import { type DashboardCta, loadStudentDashboard } from '@/lib/dashboard';
import { FeedbackButton } from '../_components/feedback-button';
import { VocabDashboardCard } from '../_components/vocab-dashboard-card';
import { WeekRhythmPanel } from '../_components/week-rhythm-panel';
import { ConceptList } from './concept-list';

export default async function DashboardPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) return redirect({ href: '/login', locale });

  const t = await getTranslations('student.dashboard');
  const tc = await getTranslations('common');
  const ts = await getTranslations('settings');
  const tw = await getTranslations('student.words');

  // Progress lives in the learner model, which only students have.
  const student =
    session.user.role === 'STUDENT'
      ? await loadStudentDashboard({
          userId: session.user.id,
          locale: isLocale(locale) ? locale : 'en',
        })
      : null;
  const cta: DashboardCta = student?.cta ?? { kind: 'practice' };

  async function logout() {
    'use server';
    await signOut({ redirect: false });
    redirect({ href: '/', locale: await getLocale() });
  }

  return (
    <>
      <main className="mx-auto max-w-4xl p-6">
        {/* Wraps under the title on narrow screens instead of overflowing (320 px). */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <div className="flex flex-wrap items-center gap-1">
            <TopBarControls />
            <FeedbackButton />
            {student ? (
              <Link href="/words" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                {tw('navLink')}
              </Link>
            ) : null}
            <Link href="/settings" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {ts('navLink')}
            </Link>
            <form action={logout}>
              <Button variant="ghost" size="sm" type="submit">
                {tc('signOut')}
              </Button>
            </form>
          </div>
        </header>

        <p className="mb-2 text-ink-muted">
          {t('welcome', { name: session.user.name ?? 'friend' })}
        </p>
        {student?.level ? (
          <p className="mb-2 text-ink" data-dashboard-level>
            {t('level', { level: student.level })}
          </p>
        ) : null}

        <div className="mt-6 mb-10">
          {cta.kind === 'diagnostic' ? (
            // No prefetch: rendering /diagnostic for a finished attempt writes
            // (ensureBootstrapped), so it must run only when the learner clicks.
            <Link href="/diagnostic" prefetch={false} className={buttonVariants({ size: 'lg' })}>
              {t('findLevel')}
            </Link>
          ) : (
            <Link href="/exercises" className={buttonVariants({ size: 'lg' })}>
              {cta.kind === 'review' ? t('review', { count: cta.count }) : t('continuePractice')}
            </Link>
          )}
        </div>

        {student?.showWeekRhythm ? (
          <div className="mb-10">
            <WeekRhythmPanel />
          </div>
        ) : null}

        {student?.vocab ? (
          <div className="mb-10">
            <VocabDashboardCard initial={student.vocab} />
          </div>
        ) : null}

        {student ? (
          <ConceptList sections={student.sections} diagnosticDone={student.diagnosticDone} />
        ) : null}
      </main>
      <Footer />
    </>
  );
}
