'use client';

import type { CefrLevelValue } from '@englishlearn/db/schemas';
import { buttonVariants, cn } from '@englishlearn/ui';
import { ChevronLeft, ChevronRight, EyeOff, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, useTransition } from 'react';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link } from '@/i18n/navigation';
import { callServerAction } from '@/lib/action-skew';
import type {
  WordBadge,
  WordLevelGroup,
  WordPreference,
  WordPreferenceChange,
  WordRowView,
  WordsPage,
  WordsPageView,
} from '@/lib/vocab-words';
import {
  prioritizeLevelAction,
  setWordPreferenceAction,
  type WordPreferenceActionError,
} from '../../actions/vocab-preferences';
import { AddToListMenu } from '../_components/add-to-list-menu';
import { StageBadge } from '../_components/stage-badge';

const PREFERENCE_AFTER: Record<WordPreferenceChange, WordPreference> = {
  prioritize: 'PRIORITIZED',
  hide: 'HIDDEN',
  unprioritize: null,
  unhide: null,
};

/** "Prioritize this level" takes a word never answered, neither hidden nor prioritized. */
const eligible = (badge: WordBadge, preference: WordPreference) =>
  badge === 'not_started' && preference === null;

type RowsState = {
  preferences: ReadonlyMap<string, WordPreference>;
  prioritizable: ReadonlyMap<CefrLevelValue, number>;
};

type Failure =
  | { kind: 'word'; word: WordRowView; change: WordPreferenceChange; error: FailureText }
  | { kind: 'level'; group: WordLevelGroup; error: FailureText };
type FailureText = 'failed' | 'rateLimited' | 'notFound';

const failureText = (error: WordPreferenceActionError | null): FailureText =>
  error === 'RATE_LIMITED' ? 'rateLimited' : error === 'NOT_FOUND' ? 'notFound' : 'failed';

export function pageHref(page: WordsPage, n: number) {
  const pathname =
    page.kind === 'topic' ? `/words/topics/${page.topic}` : `/words/collections/${page.key}`;
  return n === 1 ? { pathname } : { pathname, query: { page: String(n) } };
}

const quietButton = cn(buttonVariants({ variant: 'secondary', size: 'sm' }));

/**
 * A topic or collection word page (B6.6): rows grouped by level with the
 * learner's stage badge and the preference actions. Every action is
 * optimistic — the row changes at once and goes back if the server refuses
 * or does not answer, with an inline Retry. Words are named by slug only.
 * Hidden rows stay listed, muted, with Unhide.
 */
export function WordsBrowser({ page, view }: { page: WordsPage; view: WordsPageView }) {
  const t = useTranslations('student.words.browse');
  const tp = useTranslations('student.words.player');
  const [, startTransition] = useTransition();

  // Rows' preferences and each level's "prioritizable" count change together.
  const [rows, setRows] = useState<RowsState>(() => ({
    preferences: new Map(view.groups.flatMap((g) => g.words.map((w) => [w.slug, w.preference]))),
    prioritizable: new Map(view.groups.map((g) => [g.level, g.prioritizable])),
  }));
  const { preferences, prioritizable } = rows;
  const [levelNotes, setLevelNotes] = useState<ReadonlyMap<CefrLevelValue, string>>(new Map());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // One request per word / level at a time, guarded before the call.
  const pending = useRef(new Set<string>());

  const preferenceOf = useCallback(
    (word: WordRowView) => preferences.get(word.slug) ?? null,
    [preferences],
  );

  /** Move rows to new preferences, keeping each level's "prioritizable" count in step. */
  const move = useCallback((changes: ReadonlyArray<readonly [WordRowView, WordPreference]>) => {
    setRows((current) => {
      const next = new Map(current.preferences);
      const counts = new Map(current.prioritizable);
      for (const [word, to] of changes) {
        const from = next.get(word.slug) ?? null;
        const d = Number(eligible(word.badge, to)) - Number(eligible(word.badge, from));
        counts.set(word.level, Math.max(0, (counts.get(word.level) ?? 0) + d));
        next.set(word.slug, to);
      }
      return { preferences: next, prioritizable: counts };
    });
  }, []);

  const changeWord = useCallback(
    (word: WordRowView, change: WordPreferenceChange) => {
      const key = `word:${word.slug}`;
      if (pending.current.has(key)) return;
      pending.current.add(key);
      const before = preferenceOf(word);
      move([[word, PREFERENCE_AFTER[change]]]);
      setFailure(null);
      startTransition(async () => {
        let error: WordPreferenceActionError | null = null;
        try {
          const res = await callServerAction(() =>
            setWordPreferenceAction({ slug: word.slug, change }),
          );
          if (!res.ok) error = res.error;
        } catch {
          // No reply: the preference is a plain upsert/delete, sending again is safe.
          error = 'UNAVAILABLE';
        }
        pending.current.delete(key);
        if (error === null) {
          setAnnouncement(t(`announce.${change}`, { word: word.headword }));
          return;
        }
        move([[word, before]]);
        setFailure({ kind: 'word', word, change, error: failureText(error) });
      });
    },
    [preferenceOf, move, t],
  );

  const prioritizeGroup = useCallback(
    (group: WordLevelGroup) => {
      const key = `level:${group.level}`;
      if (pending.current.has(key)) return;
      pending.current.add(key);
      // Optimistic: this page's eligible rows of the level; the reply names the batch.
      const shown = group.words.filter((w) => eligible(w.badge, preferenceOf(w)));
      move(shown.map((w) => [w, 'PRIORITIZED'] as const));
      setFailure(null);
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof prioritizeLevelAction>> | null = null;
        try {
          res = await callServerAction(() => prioritizeLevelAction({ page, level: group.level }));
        } catch {
          res = null;
        }
        pending.current.delete(key);
        if (res?.ok) {
          const batch = new Set(res.value.slugs);
          // A row outside this call's 200 goes back to new; the count is the server's.
          move(shown.filter((w) => !batch.has(w.slug)).map((w) => [w, null] as const));
          const { remaining } = res.value;
          setRows((current) => ({
            ...current,
            prioritizable: new Map(current.prioritizable).set(group.level, remaining),
          }));
          const note = [
            t('levelDone', { count: res.value.prioritized }),
            res.value.remaining > 0 ? t('levelMore', { count: res.value.remaining }) : '',
          ]
            .join(' ')
            .trim();
          setLevelNotes((notes) => new Map(notes).set(group.level, note));
          return;
        }
        // Back as they were; the count follows the rows.
        move(shown.map((w) => [w, null] as const));
        setFailure({
          kind: 'level',
          group,
          error: failureText(res?.ok === false ? res.error : null),
        });
      });
    },
    [page, preferenceOf, move, t],
  );

  const backHref = '/words';
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-3xl font-bold text-ink">{view.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <TopBarControls />
            <Link href={backHref} className="text-sm text-ink-muted underline">
              {t('back')}
            </Link>
          </div>
        </div>
        <p className="text-sm text-ink-muted" data-total={view.total}>
          {t('count', { count: view.total })}
        </p>
        {page.kind === 'collection' && view.total > 0 ? (
          <Link
            href={{ pathname: '/words/practice', query: { collection: page.key } }}
            className={`${buttonVariants({ size: 'md' })} w-fit`}
          >
            {t('practise')}
          </Link>
        ) : null}
      </header>

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {view.groups.length === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}

      {view.groups.map((group) => {
        const headingId = `level-${group.level}`;
        const count = prioritizable.get(group.level) ?? 0;
        const note = levelNotes.get(group.level);
        return (
          <section
            key={group.level}
            aria-labelledby={headingId}
            className="flex flex-col gap-3"
            data-level={group.level}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id={headingId} className="font-content text-xl text-ink">
                {t('level', { level: group.level })}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {'concept' in group.practice ? (
                  <Link
                    href={{
                      pathname: '/words/practice',
                      query: { concept: group.practice.concept },
                    }}
                    className={quietButton}
                  >
                    {t('practiseLevel', { level: group.level })}
                  </Link>
                ) : null}
                {count > 0 ? (
                  <button
                    type="button"
                    className={quietButton}
                    onClick={() => prioritizeGroup(group)}
                    data-prioritize-level={group.level}
                  >
                    <Star aria-hidden="true" className="mr-1.5 size-4" />
                    {t('prioritizeLevel', { count })}
                  </button>
                ) : null}
              </div>
            </div>
            {note ? <p className="text-sm text-ink">{note}</p> : null}
            {failure?.kind === 'level' && failure.group.level === group.level ? (
              <FailureLine
                text={t(failure.error)}
                retry={t('retry')}
                onRetry={() => prioritizeGroup(group)}
              />
            ) : null}
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
              {group.words.map((word) => (
                <WordRow
                  key={word.slug}
                  word={word}
                  preference={preferenceOf(word)}
                  glossLang={view.glossLang}
                  practice={group.practice}
                  posLabel={tp('pos', { pos: word.pos })}
                  onChange={(change) => changeWord(word, change)}
                  failure={
                    failure?.kind === 'word' && failure.word.slug === word.slug ? (
                      <FailureLine
                        text={t(failure.error)}
                        retry={t('retry')}
                        onRetry={() => changeWord(word, failure.change)}
                      />
                    ) : null
                  }
                />
              ))}
            </ul>
          </section>
        );
      })}

      {view.pageCount > 1 ? (
        <nav aria-label={t('pages.label')} className="flex items-center justify-between gap-3">
          {view.page > 1 ? (
            <Link href={pageHref(page, view.page - 1)} className={quietButton} rel="prev">
              <ChevronLeft aria-hidden="true" className="mr-1 size-4" />
              {t('pages.previous')}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-ink-muted" aria-current="page">
            {t('pages.status', { page: view.page, count: view.pageCount })}
          </p>
          {view.page < view.pageCount ? (
            <Link href={pageHref(page, view.page + 1)} className={quietButton} rel="next">
              {t('pages.next')}
              <ChevronRight aria-hidden="true" className="ml-1 size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}

function FailureLine({
  text,
  retry,
  onRetry,
}: {
  text: string;
  retry: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-1">
      <p className="text-sm text-feedback-incorrect">{text}</p>
      <button type="button" className={quietButton} onClick={onRetry}>
        {retry}
      </button>
    </div>
  );
}

function WordRow({
  word,
  preference,
  glossLang,
  practice,
  posLabel,
  onChange,
  failure,
}: {
  word: WordRowView;
  preference: WordPreference;
  glossLang: string;
  practice: WordLevelGroup['practice'];
  posLabel: string;
  onChange: (change: WordPreferenceChange) => void;
  failure: React.ReactNode;
}) {
  const t = useTranslations('student.words.browse');
  const hidden = preference === 'HIDDEN';
  const prioritized = preference === 'PRIORITIZED';
  const isNew = word.badge === 'not_started';
  return (
    <li
      className={cn('flex flex-col gap-2 px-4 py-3', hidden ? 'bg-surface' : 'bg-surface-2')}
      data-word={word.slug}
      data-preference={preference ?? 'NONE'}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span lang="en" className={cn('font-medium', hidden ? 'text-ink-muted' : 'text-ink')}>
              {word.headword}
            </span>
            <span className="text-xs text-ink-muted">{posLabel}</span>
            <span className="font-mono text-xs text-ink-muted">{word.level}</span>
          </p>
          <p lang={glossLang} className="text-sm text-ink-muted">
            {word.gloss}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge badge={word.badge} />
          {prioritized ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
              <Star aria-hidden="true" className="size-3.5 fill-current" />
              {t('prioritized')}
            </span>
          ) : null}
          {hidden ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
              <EyeOff aria-hidden="true" className="size-3.5" />
              {t('hidden')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!hidden && (isNew || prioritized) ? (
          <button
            key="priority"
            type="button"
            className={quietButton}
            onClick={() => onChange(prioritized ? 'unprioritize' : 'prioritize')}
            aria-label={t(`actionLabels.${prioritized ? 'unprioritize' : 'prioritize'}`, {
              word: word.headword,
            })}
          >
            {t(`actions.${prioritized ? 'unprioritize' : 'prioritize'}`)}
          </button>
        ) : null}
        {!hidden && isNew ? (
          <Link
            key="know"
            href={{ pathname: '/words/practice', query: { prove: word.slug, ...practice } }}
            className={quietButton}
            aria-label={t('actionLabels.know', { word: word.headword })}
          >
            {t('actions.know')}
          </Link>
        ) : null}
        {/* One element for Hide and Unhide: focus stays on it when the row changes. */}
        <button
          key="visibility"
          type="button"
          className={quietButton}
          onClick={() => onChange(hidden ? 'unhide' : 'hide')}
          aria-label={t(`actionLabels.${hidden ? 'unhide' : 'hide'}`, { word: word.headword })}
        >
          {t(`actions.${hidden ? 'unhide' : 'hide'}`)}
        </button>
        {/* A hidden word offers Unhide only (B6.6). */}
        {!hidden ? <AddToListMenu slug={word.slug} headword={word.headword} /> : null}
      </div>
      {failure}
    </li>
  );
}
