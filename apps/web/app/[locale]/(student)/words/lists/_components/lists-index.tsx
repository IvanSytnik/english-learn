'use client';

import { buttonVariants, cn, Input } from '@englishlearn/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useId, useRef, useState, useTransition } from 'react';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link, useRouter } from '@/i18n/navigation';
import { callServerAction } from '@/lib/action-skew';
import type { WordListCardView, WordListsIndexView } from '@/lib/word-lists';
import {
  createWordListAction,
  restoreWordListAction,
  type WordListActionError,
} from '../../../actions/word-lists';
import { BADGE_DOT, STAGE_ORDER } from '../../_components/stage-badge';

const quiet = buttonVariants({ variant: 'secondary', size: 'sm' });

/**
 * `/words/lists` (B6.7): the learner's active lists — title, word count,
 * stage summary (V2-16), last change — a form for a new list, "New list from
 * text" (the paste dialog, C4), and archived lists in a collapsed section
 * with Restore. Creating a list opens it.
 */
export function ListsIndex({
  view,
  pasteImport,
}: {
  view: WordListsIndexView;
  pasteImport?: ReactNode;
}) {
  const t = useTranslations('student.words.lists');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const titleId = useId();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<{ where: string; text: string; retry?: () => void } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState('');
  const busy = useRef(false);

  const errorText = (e: WordListActionError | null) =>
    e === 'LIMIT'
      ? t('errors.limit')
      : e === 'RATE_LIMITED'
        ? t('errors.rateLimited')
        : e === 'INVALID'
          ? t('errors.invalidTitle')
          : e === 'NOT_FOUND'
            ? t('errors.notFound')
            : t('errors.failed');

  const atLimit = view.active.length >= view.maxActive;

  const create = (event?: React.FormEvent) => {
    event?.preventDefault();
    const name = title.trim();
    if (name.length < 1 || name.length > 80) {
      setError({ where: 'create', text: t('errors.invalidTitle') });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      let failure: WordListActionError | null = null;
      try {
        const res = await callServerAction(() => createWordListAction({ title: name }));
        if (res.ok) {
          router.push(`/words/lists/${res.value.id}`);
          return;
        }
        failure = res.error;
      } catch {
        failure = 'UNAVAILABLE';
      } finally {
        busy.current = false;
      }
      setError({ where: 'create', text: errorText(failure), retry: () => create() });
    });
  };

  const restore = (list: WordListCardView) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      let failure: WordListActionError | null = null;
      try {
        const res = await callServerAction(() => restoreWordListAction({ listId: list.id }));
        if (res.ok) {
          setAnnouncement(t('restored', { title: list.title }));
          router.refresh();
          return;
        }
        failure = res.error;
      } catch {
        failure = 'UNAVAILABLE';
      } finally {
        busy.current = false;
      }
      setError({ where: list.id, text: errorText(failure), retry: () => restore(list) });
    });
  };

  const errorLine = (where: string) =>
    error?.where === where ? (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-feedback-incorrect">{error.text}</p>
        {error.retry ? (
          <button type="button" className={quiet} onClick={error.retry}>
            {t('retry')}
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-3xl font-bold text-ink">{t('title')}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <TopBarControls />
            <Link href="/words" className="text-sm text-ink-muted underline">
              {t('back')}
            </Link>
          </div>
        </div>
        <p className="text-sm text-ink-muted" data-active-lists={view.active.length}>
          {t('count', { count: view.active.length, max: view.maxActive })}
        </p>
      </header>

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <section aria-labelledby={titleId} className="flex flex-col gap-3">
        <h2 id={titleId} className="font-content text-xl text-ink">
          {t('create.label')}
        </h2>
        {atLimit ? (
          <p className="text-sm text-ink">{t('errors.limit')}</p>
        ) : (
          <form onSubmit={create} className="flex flex-wrap items-end gap-2">
            <label htmlFor={`${titleId}-input`} className="sr-only">
              {t('create.label')}
            </label>
            <Input
              id={`${titleId}-input`}
              value={title}
              maxLength={80}
              placeholder={t('create.placeholder')}
              onChange={(e) => setTitle(e.target.value)}
              className="w-72"
            />
            <button type="submit" className={buttonVariants({ size: 'md' })}>
              {t('create.submit')}
            </button>
          </form>
        )}
        {atLimit ? null : pasteImport}
        {errorLine('create')}
      </section>

      {view.active.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-lists="active">
          {view.active.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </ul>
      )}

      {view.archived.length > 0 ? (
        <details className="flex flex-col gap-3" data-lists="archived">
          <summary className="cursor-pointer font-content text-lg text-ink">
            {t('archivedTitle', { count: view.archived.length })}
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line">
            {view.archived.map((list) => (
              <li
                key={list.id}
                className="flex flex-col gap-2 bg-surface-2 px-4 py-3"
                data-archived-list={list.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/words/lists/${list.id}`} className="text-ink underline">
                    {list.title}
                  </Link>
                  <button
                    type="button"
                    className={quiet}
                    aria-label={t('restoreLabel', { title: list.title })}
                    onClick={() => restore(list)}
                  >
                    {t('restore')}
                  </button>
                </div>
                {errorLine(list.id)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}

function ListCard({ list }: { list: WordListCardView }) {
  const t = useTranslations('student.words.lists');
  const tb = useTranslations('student.words.browse');
  const format = useFormatter();
  return (
    <li
      className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-4"
      data-list-card={list.id}
    >
      <Link
        href={`/words/lists/${list.id}`}
        className={cn('font-content text-lg text-ink underline-offset-4 hover:underline')}
      >
        {list.title}
      </Link>
      <p className="text-sm text-ink-muted">
        {t('words', { count: list.count })} ·{' '}
        {t('updated', {
          date: format.dateTime(new Date(list.updatedAt), { dateStyle: 'medium' }),
        })}
      </p>
      {list.count > 0 ? (
        <ul aria-label={t('stagesLabel')} className="flex flex-wrap gap-x-3 gap-y-1">
          {STAGE_ORDER.filter((b) => list.stages[b] > 0).map((badge) => (
            <li
              key={badge}
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted"
              data-stage={badge}
            >
              <span aria-hidden="true" className={`size-2 rounded-full ${BADGE_DOT[badge]}`} />
              {tb(`badge.${badge}`)}: {list.stages[badge]}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
