'use client';

import type { WordStage } from '@englishlearn/learner-model';
import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { type DashboardVocab, toDashboardVocab, vocabCardCta } from '@/lib/vocab-card';
import { vocabOverviewAction } from '../actions/vocab';
import { browserTimeZone } from './browser-time-zone';

const STAGES: readonly WordStage[] = ['new', 'learning', 'familiar', 'known', 'mastered'];

/** Literal class names so Tailwind sees them; decorative, the word carries the meaning. */
const STAGE_FILL: Record<WordStage, string> = {
  new: 'bg-mastery-1',
  learning: 'bg-mastery-2',
  familiar: 'bg-mastery-3',
  known: 'bg-mastery-4',
  mastered: 'bg-mastery-5',
};

/**
 * The dashboard's vocabulary card: what is due, today's new words, the
 * learner's words by semantic stage, and where to go next. Rendered first
 * from the server's UTC snapshot; refreshed once in the browser's time zone
 * after mounting. A failed refresh keeps the snapshot.
 */
export function VocabDashboardCard({ initial }: { initial: DashboardVocab }) {
  const t = useTranslations('student.dashboard.vocab');
  const ts = useTranslations('student.words.stages');
  const [vocab, setVocab] = useState(initial);

  useEffect(() => {
    let live = true;
    vocabOverviewAction({ timeZone: browserTimeZone() })
      .then((res) => {
        if (live && res.ok) setVocab(toDashboardVocab(res.value));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const cta = vocabCardCta(vocab);
  const total = STAGES.reduce((n, stage) => n + vocab.stages[stage], 0);

  return (
    <Card data-vocab-card="">
      <CardHeader className="pb-4">
        <CardTitle className="text-ink">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-lg text-ink" data-due-now={vocab.dueNow}>
            {t('due', { count: vocab.dueNow })}
          </p>
          <p className="text-sm text-ink-muted" data-new-today={vocab.newToday}>
            {t('newToday', { done: vocab.newToday, limit: vocab.dailyLimit })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-line">
            {total > 0
              ? STAGES.map((stage) =>
                  vocab.stages[stage] > 0 ? (
                    <div
                      key={stage}
                      className={`h-full ${STAGE_FILL[stage]}`}
                      style={{ width: `${(vocab.stages[stage] / total) * 100}%` }}
                    />
                  ) : null,
                )
              : null}
          </div>
          <dl aria-label={t('stages')} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {STAGES.map((stage) => (
              <div key={stage} className="flex items-center gap-1.5" data-stage={stage}>
                <dt className="flex items-center gap-1.5 text-ink-muted">
                  <span aria-hidden="true" className={`size-2 rounded-full ${STAGE_FILL[stage]}`} />
                  {ts(stage)}
                </dt>
                <dd className="font-medium text-ink tabular-nums">{vocab.stages[stage]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={cta.kind === 'open' ? '/words' : '/words/practice'}
            className={buttonVariants()}
            data-vocab-cta={cta.kind}
          >
            {cta.kind === 'review'
              ? t('review', { count: cta.count })
              : cta.kind === 'learn'
                ? t('learn')
                : t('open')}
          </Link>
          <Link href="/words" className="text-sm text-ink-muted underline hover:text-ink">
            {t('allTopics')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
