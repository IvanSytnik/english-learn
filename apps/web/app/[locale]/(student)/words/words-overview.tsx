'use client';

import type { WordStage } from '@englishlearn/learner-model';
import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link } from '@/i18n/navigation';
import type { VocabOverviewView, VocabTopicProgress } from '@/lib/vocab-overview';
import { browserTimeZone } from '../_components/browser-time-zone';
import { vocabOverviewAction } from '../actions/vocab';
import { DailyLimitForm } from './daily-limit-form';

const STAGES: readonly WordStage[] = ['new', 'learning', 'familiar', 'known', 'mastered'];

/** Literal class names so Tailwind sees them; decorative, the word carries the meaning. */
const STAGE_DOT: Record<WordStage, string> = {
  new: 'bg-mastery-1',
  learning: 'bg-mastery-2',
  familiar: 'bg-mastery-3',
  known: 'bg-mastery-4',
  mastered: 'bg-mastery-5',
};

/** Starts a vocabulary session: the whole pool, or one topic concept. */
export function practiceHref(conceptId?: string) {
  return conceptId
    ? { pathname: '/words/practice', query: { concept: conceptId } }
    : { pathname: '/words/practice' };
}

/**
 * `/words`: today's allowance and reviews, the learner's words by semantic
 * stage, and the topics with their levels — counts only, never an FSRS
 * number. Rendered first in UTC by the page; refreshed in the browser's time
 * zone after mounting and after the daily limit changes. A failed refresh
 * keeps what is shown.
 */
export function WordsOverview({ initial }: { initial: VocabOverviewView }) {
  const t = useTranslations('student.words');
  const [overview, setOverview] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await vocabOverviewAction({ timeZone: browserTimeZone() });
      if (res.ok) setOverview(res.value);
    } catch {
      // Offline: the counts already on screen stay.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold text-ink">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TopBarControls />
          <Link href="/dashboard" className="text-sm text-ink-muted underline">
            {t('backToDashboard')}
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('today.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-lg text-ink" data-due-now={overview.dueNow}>
              {t('today.due', { count: overview.dueNow })}
            </p>
            <p className="text-sm text-ink-muted">
              {t('today.newWords', { done: overview.newToday, limit: overview.dailyLimit })}
            </p>
            <p className="text-sm text-ink-muted">
              {t('today.remaining', { count: overview.remainingNew })}
            </p>
            <Link href={practiceHref()} className={`${buttonVariants({ size: 'lg' })} mt-2 w-fit`}>
              {t('start')}
            </Link>
          </div>
          <DailyLimitForm initial={overview.dailyLimit} onSaved={() => void refresh()} />
        </CardContent>
      </Card>

      <section aria-labelledby="words-stages" className="flex flex-col gap-3">
        <h2 id="words-stages" className="font-content text-xl text-ink">
          {t('stages.title')}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex flex-col gap-1 rounded-card border border-line bg-surface-2 px-4 py-3"
              data-stage={stage}
            >
              <dt className="flex items-center gap-2 text-sm text-ink-muted">
                <span aria-hidden="true" className={`size-2.5 rounded-full ${STAGE_DOT[stage]}`} />
                {t(`stages.${stage}`)}
              </dt>
              <dd className="text-2xl font-semibold text-ink tabular-nums">
                {overview.stages[stage]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="words-topics" className="flex flex-col gap-3">
        <h2 id="words-topics" className="font-content text-xl text-ink">
          {t('topics.title')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.topics.map((topic) => (
            <li key={topic.topicId}>
              <TopicCard topic={topic} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function TopicCard({ topic }: { topic: VocabTopicProgress }) {
  const t = useTranslations('student.words.topics');
  const share = topic.total === 0 ? 0 : Math.round((topic.started / topic.total) * 100);
  return (
    <Card className="flex h-full flex-col gap-3 p-4" data-topic={topic.topicId}>
      <h3 className="font-medium text-ink">{topic.title}</h3>
      <p className="text-sm text-ink-muted">
        {t('progress', { started: topic.started, total: topic.total })}
      </p>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent" style={{ width: `${share}%` }} />
      </div>
      <ul className="mt-auto flex flex-wrap gap-2">
        {topic.levels.map((level) => (
          <li key={level.conceptId}>
            <Link
              href={practiceHref(level.conceptId)}
              aria-label={t('practiceLevel', { topic: topic.title, level: level.level })}
              className="inline-flex items-center gap-2 rounded-control border border-line px-2 py-1 text-sm text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              data-concept={level.conceptId}
            >
              <span className="font-mono text-xs text-ink-muted">{level.level}</span>
              <span className="tabular-nums">
                {t('levelProgress', { started: level.started, total: level.total })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
