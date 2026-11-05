'use client';

import { buttonVariants, cn, Input } from '@englishlearn/ui';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link, useRouter } from '@/i18n/navigation';
import { callServerAction } from '@/lib/action-skew';
import type { WordListPageView, WordListRowView } from '@/lib/word-lists';
import {
  archiveWordListAction,
  moveWordInListAction,
  removeWordFromListAction,
  renameWordListAction,
  restoreWordListAction,
  setWordListNoteAction,
  type WordListActionError,
} from '../../../actions/word-lists';
import { StageBadge } from '../../_components/stage-badge';
import { WordSearch } from './word-search';

const quiet = buttonVariants({ variant: 'secondary', size: 'sm' });
const iconButton =
  'inline-flex size-8 items-center justify-center rounded-control border border-line bg-surface text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40';

type Anchor = { before: string } | { after: string };
type Failure = { slug: string | null; text: string; retry: () => void };

export function listPageHref(listId: string, n: number) {
  const pathname = `/words/lists/${listId}`;
  return n === 1 ? { pathname } : { pathname, query: { page: String(n) } };
}

/**
 * One word list (B6.7): rename, archive (or restore, read-only while
 * archived), "Practise this list", the catalogue search, and the words — a
 * table in list order with stage badges, notes, removal and reordering by
 * drag or by keyboard (Move up / Move down, across a page edge too). Every
 * change is optimistic and goes back with an inline Retry when the server
 * refuses or does not answer; one request per word at a time.
 */
export function ListEditor({
  view,
  searchMinChars,
  pasteImport,
}: {
  view: WordListPageView;
  searchMinChars: number;
  /** The paste dialog's button (C4), rendered by the page. */
  pasteImport?: ReactNode;
}) {
  const t = useTranslations('student.words.list');
  const tl = useTranslations('student.words.lists');
  const tb = useTranslations('student.words.browse');
  const tp = useTranslations('student.words.player');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const titleId = useId();

  // Rows follow the server's view; a new view (refresh, page) replaces local edits.
  const [rows, setRows] = useState<readonly WordListRowView[]>(view.rows);
  const [total, setTotal] = useState(view.total);
  const [shown, setShown] = useState(view);
  if (shown !== view) {
    setShown(view);
    setRows(view.rows);
    setTotal(view.total);
  }
  const [title, setTitle] = useState(view.title);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ slug: string; text: string } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef(new Set<string>());
  const dragSlug = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focusNext, setFocusNext] = useState<string | null>(null);

  // After a keyboard move the same control keeps focus (or its twin at an edge).
  useEffect(() => {
    if (focusNext === null) return;
    const [slug, dir] = focusNext.split('|') as [string, 'up' | 'down'];
    const own = buttons.current.get(`${slug}|${dir}`);
    const twin = buttons.current.get(`${slug}|${dir === 'up' ? 'down' : 'up'}`);
    (own && !own.disabled ? own : twin)?.focus();
    setFocusNext(null);
  }, [focusNext]);

  const errorText = (error: WordListActionError | null, limit: 'full' | 'limit' = 'full') =>
    error === 'LIMIT'
      ? tl(`errors.${limit}`)
      : error === 'RATE_LIMITED'
        ? tl('errors.rateLimited')
        : error === 'NOT_FOUND'
          ? tl('errors.notFound')
          : error === 'INVALID'
            ? tl('errors.invalidTitle')
            : tl('errors.failed');

  /** One guarded request: `apply` runs at once, `undo` if the server says no. */
  const send = (
    key: string,
    call: () => Promise<{ ok: true } | { ok: false; error: WordListActionError }>,
    handlers: { apply?: () => void; undo?: () => void; done?: () => void; slug: string | null },
    retry: () => void,
  ) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    handlers.apply?.();
    setFailure(null);
    startTransition(async () => {
      let error: WordListActionError | null = null;
      try {
        const res = await callServerAction(call);
        if (!res.ok) error = res.error;
      } catch {
        error = 'UNAVAILABLE';
      }
      pending.current.delete(key);
      if (error === null) {
        handlers.done?.();
        return;
      }
      handlers.undo?.();
      setFailure({ slug: handlers.slug, text: errorText(error), retry });
    });
  };

  const position = (index: number) => view.offset + index + 1;

  /** Move within this page: the row moves at once. */
  const moveWithin = (
    slug: string,
    from: number,
    to: number,
    anchor: Anchor,
    dir?: 'up' | 'down',
  ) => {
    const before = rows;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    send(
      `move:${slug}`,
      () => moveWordInListAction({ listId: view.id, slug, anchor }),
      {
        slug,
        apply: () => {
          setRows(next);
          if (dir) setFocusNext(`${slug}|${dir}`);
        },
        undo: () => setRows(before),
        done: () =>
          setAnnouncement(t('announce.moved', { word: row.headword, position: position(to) })),
      },
      () => moveWithin(slug, from, to, anchor, dir),
    );
  };

  /** Move past this page's edge: the row leaves the page, the server's view follows. */
  const moveAcross = (row: WordListRowView, anchor: Anchor) =>
    send(
      `move:${row.slug}`,
      () => moveWordInListAction({ listId: view.id, slug: row.slug, anchor }),
      {
        slug: row.slug,
        done: () => {
          setAnnouncement(t('announce.movedAway', { word: row.headword }));
          router.refresh();
        },
      },
      () => moveAcross(row, anchor),
    );

  const moveBy = (row: WordListRowView, dir: 'up' | 'down') => {
    const i = rows.findIndex((r) => r.slug === row.slug);
    const neighbour = rows[dir === 'up' ? i - 1 : i + 1];
    if (neighbour) {
      const anchor = dir === 'up' ? { before: neighbour.slug } : { after: neighbour.slug };
      moveWithin(row.slug, i, dir === 'up' ? i - 1 : i + 1, anchor, dir);
      return;
    }
    const edge = dir === 'up' ? view.prevSlug : view.nextSlug;
    if (edge) moveAcross(row, dir === 'up' ? { before: edge } : { after: edge });
  };

  const drop = (target: WordListRowView) => {
    const from = dragSlug.current;
    dragSlug.current = null;
    if (!from || from === target.slug) return;
    const i = rows.findIndex((r) => r.slug === from);
    const j = rows.findIndex((r) => r.slug === target.slug);
    if (i < 0 || j < 0) return;
    moveWithin(from, i, j, j > i ? { after: target.slug } : { before: target.slug });
  };

  const remove = (row: WordListRowView) => {
    const before = rows;
    send(
      `word:${row.slug}`,
      () => removeWordFromListAction({ listId: view.id, slug: row.slug }),
      {
        slug: null,
        apply: () => {
          setRows(rows.filter((r) => r.slug !== row.slug));
          setTotal((n) => n - 1);
        },
        undo: () => {
          setRows(before);
          setTotal((n) => n + 1);
        },
        done: () => {
          setAnnouncement(t('announce.removed', { word: row.headword }));
          // The last row of a later page: that page is gone, show the one before.
          if (before.length === 1 && view.page > 1)
            router.push(listPageHref(view.id, view.page - 1));
          // A later page's first word moves up onto this one.
          else if (view.page < view.pageCount) router.refresh();
        },
      },
      () => remove(row),
    );
  };

  const saveNote = (row: WordListRowView, text: string) => {
    const note = text.trim() === '' ? null : text.trim();
    const was = row.note;
    const set = (value: string | null) =>
      setRows((rs) => rs.map((r) => (r.slug === row.slug ? { ...r, note: value } : r)));
    send(
      `word:${row.slug}`,
      () => setWordListNoteAction({ listId: view.id, slug: row.slug, note: text }),
      {
        slug: row.slug,
        apply: () => {
          set(note);
          setNoteDraft(null);
        },
        undo: () => set(was),
        done: () => setAnnouncement(t('announce.noteSaved', { word: row.headword })),
      },
      () => saveNote(row, text),
    );
  };

  const sendTitle = (next: string, was: string) =>
    send(
      'title',
      () => renameWordListAction({ listId: view.id, title: next }),
      {
        slug: null,
        apply: () => {
          setTitle(next);
          setRenaming(null);
        },
        undo: () => setTitle(was),
        done: () => setAnnouncement(t('announce.renamed', { title: next })),
      },
      () => sendTitle(next, was),
    );

  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    if (renaming === null) return;
    const next = renaming.trim();
    if (next.length < 1 || next.length > 80) {
      setFailure({ slug: null, text: tl('errors.invalidTitle'), retry: () => setFailure(null) });
      return;
    }
    sendTitle(next, title);
  };

  const archive = () =>
    send(
      'list',
      () => archiveWordListAction({ listId: view.id }),
      { slug: null, done: () => router.push('/words/lists') },
      archive,
    );

  const restore = () => {
    if (pending.current.has('list')) return;
    pending.current.add('list');
    setFailure(null);
    startTransition(async () => {
      let error: WordListActionError | null = null;
      try {
        const res = await callServerAction(() => restoreWordListAction({ listId: view.id }));
        if (!res.ok) error = res.error;
      } catch {
        error = 'UNAVAILABLE';
      }
      pending.current.delete('list');
      if (error === null) router.refresh();
      else setFailure({ slug: null, text: errorText(error, 'limit'), retry: restore });
    });
  };

  const failureLine = (slug: string | null) =>
    failure && failure.slug === slug ? (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-feedback-incorrect">{failure.text}</p>
        <button type="button" className={quiet} onClick={failure.retry}>
          {tl('retry')}
        </button>
      </div>
    ) : null;

  const editable = !view.archived;
  const firstOverall = view.page === 1;
  const lastOverall = view.page === view.pageCount;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6" data-list={view.id}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {renaming === null ? (
            <h1 id={titleId} className="text-3xl font-bold text-ink">
              {title}
            </h1>
          ) : (
            <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
              <label htmlFor={`${titleId}-rename`} className="sr-only">
                {t('renameLabel')}
              </label>
              <Input
                id={`${titleId}-rename`}
                value={renaming}
                maxLength={80}
                autoFocus
                onChange={(e) => setRenaming(e.target.value)}
                className="w-72"
              />
              <button type="submit" className={buttonVariants({ size: 'sm' })}>
                {t('save')}
              </button>
              <button type="button" className={quiet} onClick={() => setRenaming(null)}>
                {t('cancel')}
              </button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <TopBarControls />
            <Link href="/words/lists" className="text-sm text-ink-muted underline">
              {t('back')}
            </Link>
          </div>
        </div>
        <p className="text-sm text-ink-muted" data-total={total}>
          {t('count', { count: total, max: view.capacity })}
        </p>
        {view.unavailable > 0 ? (
          <p className="text-sm text-ink-muted">{t('unavailable', { count: view.unavailable })}</p>
        ) : null}
        {view.archived ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-2 p-4">
            <p className="text-sm text-ink">{t('archivedNote')}</p>
            <button type="button" className={buttonVariants({ size: 'sm' })} onClick={restore}>
              {tl('restore')}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {total > 0 ? (
              <Link
                href={{ pathname: '/words/practice', query: { list: view.id } }}
                className={buttonVariants({ size: 'md' })}
              >
                {t('practise')}
              </Link>
            ) : null}
            {pasteImport}
            {renaming === null ? (
              <button type="button" className={quiet} onClick={() => setRenaming(title)}>
                {t('rename')}
              </button>
            ) : null}
            <button type="button" className={quiet} onClick={archive}>
              {t('archive')}
            </button>
          </div>
        )}
        {failureLine(null)}
      </header>

      <p aria-live="polite" role="status" className="sr-only" data-announce="">
        {announcement}
      </p>

      {editable ? (
        <WordSearch
          listId={view.id}
          minChars={searchMinChars}
          errorText={(e) => errorText(e)}
          onAdded={() => router.refresh()}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="text-ink-muted" data-empty-list="">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t('tableLabel')}</caption>
            <thead className="bg-surface text-left text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.order')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.word')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.level')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.gloss')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.stage')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('columns.note')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  <span className="sr-only">{t('columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface-2">
              {rows.map((row, i) => {
                const atTop = i === 0 && (firstOverall || view.prevSlug === null);
                const atBottom = i === rows.length - 1 && (lastOverall || view.nextSlug === null);
                const editingNote = noteDraft?.slug === row.slug;
                return (
                  <tr
                    key={row.slug}
                    data-row={row.slug}
                    draggable={editable}
                    onDragStart={(e) => {
                      dragSlug.current = row.slug;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', row.slug);
                    }}
                    onDragOver={(e) => {
                      if (dragSlug.current) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      drop(row);
                    }}
                    onDragEnd={() => {
                      dragSlug.current = null;
                    }}
                    className="align-top"
                  >
                    <td className="px-3 py-2 text-ink-muted tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {editable ? (
                          <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
                        ) : null}
                        {position(i)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span lang="en" className="font-medium text-ink">
                        {row.headword}
                      </span>{' '}
                      <span className="text-xs text-ink-muted">{tp('pos', { pos: row.pos })}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-muted">{row.level}</td>
                    <td lang={view.glossLang} className="px-3 py-2 text-ink-muted">
                      {row.gloss}
                    </td>
                    <td className="px-3 py-2">
                      <StageBadge badge={row.badge} />
                    </td>
                    <td className="px-3 py-2">
                      {editingNote ? (
                        <form
                          className="flex flex-col gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveNote(row, noteDraft.text);
                          }}
                        >
                          <label className="sr-only" htmlFor={`note-${row.slug}`}>
                            {t('noteLabel', { word: row.headword })}
                          </label>
                          <Input
                            id={`note-${row.slug}`}
                            value={noteDraft.text}
                            maxLength={200}
                            autoFocus
                            onChange={(e) => setNoteDraft({ slug: row.slug, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setNoteDraft(null);
                            }}
                            className="w-48"
                          />
                          <span className="text-xs text-ink-muted">
                            {t('noteCounter', { count: noteDraft.text.length, max: 200 })}
                          </span>
                          <span className="flex gap-1">
                            <button type="submit" className={quiet}>
                              {t('noteSave')}
                            </button>
                            <button
                              type="button"
                              className={quiet}
                              onClick={() => setNoteDraft(null)}
                            >
                              {t('cancel')}
                            </button>
                          </span>
                        </form>
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          {row.note ? <span className="text-ink">{row.note}</span> : null}
                          {editable ? (
                            <button
                              type="button"
                              className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
                              aria-label={t(row.note ? 'noteEditLabel' : 'noteAddLabel', {
                                word: row.headword,
                              })}
                              onClick={() => setNoteDraft({ slug: row.slug, text: row.note ?? '' })}
                            >
                              {t(row.note ? 'noteEdit' : 'noteAdd')}
                            </button>
                          ) : null}
                        </span>
                      )}
                      {failureLine(row.slug)}
                    </td>
                    <td className="px-3 py-2">
                      {editable ? (
                        <span className="flex items-center gap-1">
                          <button
                            ref={(el) => {
                              if (el) buttons.current.set(`${row.slug}|up`, el);
                              else buttons.current.delete(`${row.slug}|up`);
                            }}
                            type="button"
                            className={iconButton}
                            aria-label={t('moveUp', { word: row.headword })}
                            disabled={atTop}
                            onClick={() => moveBy(row, 'up')}
                          >
                            <ArrowUp aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            ref={(el) => {
                              if (el) buttons.current.set(`${row.slug}|down`, el);
                              else buttons.current.delete(`${row.slug}|down`);
                            }}
                            type="button"
                            className={iconButton}
                            aria-label={t('moveDown', { word: row.headword })}
                            disabled={atBottom}
                            onClick={() => moveBy(row, 'down')}
                          >
                            <ArrowDown aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(quiet, 'ml-1')}
                            aria-label={t('removeLabel', { word: row.headword })}
                            onClick={() => remove(row)}
                          >
                            {t('remove')}
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view.pageCount > 1 ? (
        <nav aria-label={tb('pages.label')} className="flex items-center justify-between gap-3">
          {view.page > 1 ? (
            <Link href={listPageHref(view.id, view.page - 1)} className={quiet} rel="prev">
              <ChevronLeft aria-hidden="true" className="mr-1 size-4" />
              {tb('pages.previous')}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-ink-muted" aria-current="page">
            {tb('pages.status', { page: view.page, count: view.pageCount })}
          </p>
          {view.page < view.pageCount ? (
            <Link href={listPageHref(view.id, view.page + 1)} className={quiet} rel="next">
              {tb('pages.next')}
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
