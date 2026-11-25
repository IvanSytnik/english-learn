'use client';

import { buttonVariants, cn } from '@englishlearn/ui';
import { EyeOff, Flag, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link } from '@/i18n/navigation';
import { callServerAction } from '@/lib/action-skew';
import type { WordPageView } from '@/lib/vocab-word';
import type { WordPreference, WordPreferenceChange } from '@/lib/vocab-words';
import { FeedbackDialog } from '../../../_components/feedback-dialog';
import {
  setWordPreferenceAction,
  type WordPreferenceActionError,
} from '../../../actions/vocab-preferences';
import { AddToListMenu } from '../../_components/add-to-list-menu';
import { StageBadge } from '../../_components/stage-badge';
import { IpaTag } from '../../practice/vocab-renderers';

const PREFERENCE_AFTER: Record<WordPreferenceChange, WordPreference> = {
  prioritize: 'PRIORITIZED',
  hide: 'HIDDEN',
  unprioritize: null,
  unhide: null,
};

type FailureText = 'failed' | 'rateLimited' | 'notFound';
const failureText = (error: WordPreferenceActionError): FailureText =>
  error === 'RATE_LIMITED' ? 'rateLimited' : error === 'NOT_FOUND' ? 'notFound' : 'failed';

const quietButton = cn(buttonVariants({ variant: 'secondary', size: 'sm' }));

/**
 * The word page (B6.8): the word, its meaning in the learner's language,
 * examples and collocations, where it is listed, and the learner's stage and
 * next review — a badge and whole days, never a number from the model. The
 * actions are the word rows' (B6.6): Prioritize / I know / Hide, optimistic
 * with an inline Retry, plus "Add to list" and a report about the word.
 */
export function WordView({ view }: { view: WordPageView }) {
  const t = useTranslations('student.words.word');
  const tb = useTranslations('student.words.browse');
  const tp = useTranslations('student.words.player');
  const tf = useTranslations('feedback');
  const [, startTransition] = useTransition();
  const [preference, setPreference] = useState<WordPreference>(view.preference);
  const [failure, setFailure] = useState<{
    change: WordPreferenceChange;
    error: FailureText;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [reporting, setReporting] = useState(false);
  // One request at a time, guarded before the call.
  const pending = useRef(false);

  const hidden = preference === 'HIDDEN';
  const prioritized = preference === 'PRIORITIZED';
  const isNew = view.badge === 'not_started';

  function change(next: WordPreferenceChange) {
    if (pending.current) return;
    pending.current = true;
    const before = preference;
    setPreference(PREFERENCE_AFTER[next]);
    setFailure(null);
    startTransition(async () => {
      let error: WordPreferenceActionError | null = null;
      try {
        const res = await callServerAction(() =>
          setWordPreferenceAction({ slug: view.slug, change: next }),
        );
        if (!res.ok) error = res.error;
      } catch {
        // No reply: the preference is a plain upsert/delete, sending again is safe.
        error = 'UNAVAILABLE';
      }
      pending.current = false;
      if (error === null) {
        setAnnouncement(tb(`announce.${next}`, { word: view.headword }));
        return;
      }
      setPreference(before);
      setFailure({ change: next, error: failureText(error) });
    });
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6" data-word-page={view.slug}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/words" className="text-sm text-ink-muted underline">
          {tb('back')}
        </Link>
        <TopBarControls />
      </div>

      <header className="flex flex-col gap-3">
        <h1 lang="en" className="font-content text-4xl text-ink">
          {view.headword}
        </h1>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-ink-muted">{tp('pos', { pos: view.pos })}</span>
          <span className="font-mono text-sm text-ink-muted" data-level="">
            {view.level}
          </span>
          {view.ipa ? <IpaTag ipa={view.ipa} className="text-sm text-ink-muted" /> : null}
        </p>
        <p lang={view.glossLang} className="text-xl text-ink" data-gloss="">
          {view.gloss}
        </p>
        {view.definition ? (
          <p lang="en" className="text-ink-muted" data-definition="">
            {view.definition}
          </p>
        ) : null}
      </header>

      <section
        aria-labelledby="word-progress"
        className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4"
        data-preference={preference ?? 'NONE'}
      >
        <h2 id="word-progress" className="sr-only">
          {t('progress')}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StageBadge badge={view.badge} />
          {prioritized ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
              <Star aria-hidden="true" className="size-3.5 fill-current" />
              {tb('prioritized')}
            </span>
          ) : null}
          {hidden ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
              <EyeOff aria-hidden="true" className="size-3.5" />
              {tb('hidden')}
            </span>
          ) : null}
          <p className="text-sm text-ink-muted" data-review={view.review.kind}>
            {view.review.kind === 'inDays'
              ? t('review.inDays', { days: view.review.days })
              : t(`review.${view.review.kind}`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hidden && (isNew || prioritized) ? (
            <button
              key="priority"
              type="button"
              className={quietButton}
              onClick={() => change(prioritized ? 'unprioritize' : 'prioritize')}
            >
              {tb(`actions.${prioritized ? 'unprioritize' : 'prioritize'}`)}
            </button>
          ) : null}
          {!hidden && isNew ? (
            <Link
              key="know"
              href={{
                pathname: '/words/practice',
                query: { prove: view.slug, ...(view.practice ?? {}) },
              }}
              className={quietButton}
              aria-label={tb('actionLabels.know', { word: view.headword })}
            >
              {tb('actions.know')}
            </Link>
          ) : null}
          {/* One element for Hide and Unhide: focus stays on it when the state changes. */}
          <button
            key="visibility"
            type="button"
            className={quietButton}
            onClick={() => change(hidden ? 'unhide' : 'hide')}
          >
            {tb(`actions.${hidden ? 'unhide' : 'hide'}`)}
          </button>
          {/* A hidden word offers Unhide only (B6.6). */}
          {!hidden ? <AddToListMenu slug={view.slug} headword={view.headword} /> : null}
        </div>
        {failure ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-feedback-incorrect">{tb(failure.error)}</p>
            <button type="button" className={quietButton} onClick={() => change(failure.change)}>
              {tb('retry')}
            </button>
          </div>
        ) : null}
        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>
      </section>

      {view.examples.length > 0 ? (
        <section aria-labelledby="word-examples" className="flex flex-col gap-3">
          <h2 id="word-examples" className="font-content text-xl text-ink">
            {t('examples')}
          </h2>
          <ul className="flex flex-col gap-3">
            {view.examples.map((ex) => (
              <li
                key={ex.sentence}
                className="flex flex-col gap-1 border-l-2 border-line pl-3"
                data-example=""
              >
                <p lang="en" className="font-content text-lg text-ink">
                  {ex.sentence}
                </p>
                {ex.translation ? (
                  <p lang={view.glossLang} className="text-sm text-ink-muted">
                    {ex.translation}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.collocations.length > 0 ? (
        <section aria-labelledby="word-collocations" className="flex flex-col gap-3">
          <h2 id="word-collocations" className="font-content text-xl text-ink">
            {t('collocations')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.collocations.map((c) => (
              <li
                key={c}
                lang="en"
                className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm text-ink"
                data-collocation=""
              >
                {c}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.topic || view.collections.length > 0 ? (
        <section aria-labelledby="word-where" className="flex flex-col gap-3">
          <h2 id="word-where" className="font-content text-xl text-ink">
            {t('where')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.topic ? (
              <li>
                <Link
                  href={`/words/topics/${view.topic.id}`}
                  className={quietButton}
                  data-topic={view.topic.id}
                >
                  {t('topic', { title: view.topic.title })}
                </Link>
              </li>
            ) : null}
            {view.collections.map((c) => (
              <li key={c.key}>
                <Link
                  href={`/words/collections/${c.key}`}
                  className={quietButton}
                  data-collection={c.key}
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          onClick={() => setReporting(true)}
          data-report-word=""
        >
          <Flag aria-hidden="true" className="mr-1.5 size-4" />
          {tf('reportIssue')}
        </button>
      </div>
      <FeedbackDialog open={reporting} onClose={() => setReporting(false)} wordSlug={view.slug} />
    </main>
  );
}
