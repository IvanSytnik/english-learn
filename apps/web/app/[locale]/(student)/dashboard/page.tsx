import { isLocale } from '@englishlearn/db/schemas';
import { Button, buttonVariants, Card, StageLabel } from '@englishlearn/ui';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { auth, signOut } from '@/lib/auth';
import { type DashboardConcept, type DashboardCta, loadStudentDashboard } from '@/lib/dashboard';
import { WeekRhythmPanel } from '../_components/week-rhythm-panel';

export default async function DashboardPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) return redirect({ href: '/login', locale });

  const t = await getTranslations('student.dashboard');
  const tc = await getTranslations('common');

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
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <form action={logout}>
          <Button variant="ghost" type="submit">
            {tc('signOut')}
          </Button>
        </form>
      </header>

      <p className="mb-2 text-ink-muted">{t('welcome', { name: session.user.name ?? 'friend' })}</p>
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

      {student?.sections.map((section) => (
        <section
          key={section.category}
          aria-labelledby={`topics-${section.category}`}
          className="mb-8"
        >
          <h2 id={`topics-${section.category}`} className="mb-3 font-content text-xl text-ink">
            {t('category', { category: section.category })}
          </h2>
          <Card>
            <ul className="divide-y divide-line">
              {section.concepts.map((concept) => (
                <ConceptRow key={concept.id} concept={concept} />
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </main>
  );
}

async function ConceptRow({ concept }: { concept: DashboardConcept }) {
  const t = await getTranslations('student.dashboard');
  const ts = await getTranslations('learning.stage');
  const format = await getFormatter();

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
      data-concept={concept.id}
      data-locked={concept.isLocked}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{concept.title}</span>
        <span className="rounded-control border border-line px-1.5 font-mono text-xs text-ink-muted">
          {concept.cefrLevel}
        </span>
        {concept.isRecommendedStart ? (
          <span
            className="rounded-control border border-accent px-1.5 text-xs font-medium text-accent"
            data-recommended-start
          >
            {t('recommendedStart')}
          </span>
        ) : null}
      </span>
      {concept.isLocked ? (
        <span className="text-sm text-ink-muted">
          {concept.lockedBy.length > 0
            ? t('lockedBy', {
                count: concept.lockedBy.length,
                topics: format.list(
                  concept.lockedBy.map((r) => t('quoted', { title: r.title })),
                  { type: 'conjunction' },
                ),
              })
            : t('lockedFallback')}
        </span>
      ) : (
        <StageLabel
          stage={concept.stage}
          label={ts(concept.stage)}
          fading={concept.isFading}
          fadingLabel={ts('dueForReview')}
        />
      )}
    </li>
  );
}
