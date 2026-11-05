'use client';

import { buttonVariants, cn, Input } from '@englishlearn/ui';
import { Check, ListPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { callServerAction } from '@/lib/action-skew';
import type { ListMenuView } from '@/lib/word-lists';
import {
  addWordsToListAction,
  createWordListAction,
  wordListMenuAction,
} from '../../actions/word-lists';

type MenuState =
  | { phase: 'closed' }
  | { phase: 'loading' }
  | { phase: 'ready'; view: ListMenuView }
  | { phase: 'failed' };

type Note = { kind: 'done' | 'error'; text: string } | null;

const quiet = buttonVariants({ variant: 'secondary', size: 'sm' });

/**
 * "Add to list…" for one word (B6.7): a small disclosure, not a page. Opening
 * it loads the learner's active lists (marked when they already hold the
 * word); a list adds the word in one action, "New list" creates a list with
 * it. The word is named by its public slug only. Escape closes the menu and
 * stops there (the vocabulary player's own Escape pauses the session).
 */
export function AddToListMenu({ slug, headword }: { slug: string; headword: string }) {
  const t = useTranslations('student.words.addToList');
  const tl = useTranslations('student.words.lists');
  const [state, setState] = useState<MenuState>({ phase: 'closed' });
  const [note, setNote] = useState<Note>(null);
  const [title, setTitle] = useState('');
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const open = state.phase !== 'closed';

  const close = useCallback(() => {
    setState({ phase: 'closed' });
    toggle.current?.focus();
  }, []);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const res = await callServerAction(() => wordListMenuAction({ slug }));
      setState(res.ok ? { phase: 'ready', view: res.value } : { phase: 'failed' });
    } catch {
      setState({ phase: 'failed' });
    }
  }, [slug]);

  // A click outside closes the menu (focus stays where the click put it).
  // Escape inside closes it and stops there: the player listens on window.
  useEffect(() => {
    const el = root.current;
    if (!open || el === null) return;
    const onDown = (event: MouseEvent) => {
      if (!el.contains(event.target as Node)) setState({ phase: 'closed' });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('mousedown', onDown);
    el.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      el.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const errorText = (error: string) =>
    error === 'LIMIT'
      ? tl('errors.limit')
      : error === 'RATE_LIMITED'
        ? tl('errors.rateLimited')
        : error === 'NOT_FOUND'
          ? tl('errors.notFound')
          : error === 'INVALID'
            ? tl('errors.invalidTitle')
            : tl('errors.failed');

  /** Mark a list as holding the word (or add a new one) after a successful write. */
  const markHolding = (list: { id: string; title: string }, isNew: boolean) =>
    setState((s) =>
      s.phase !== 'ready'
        ? s
        : {
            phase: 'ready',
            view: {
              ...s.view,
              lists: isNew
                ? [{ id: list.id, title: list.title, count: 1, hasWord: true }, ...s.view.lists]
                : s.view.lists.map((l) =>
                    l.id === list.id ? { ...l, hasWord: true, count: l.count + 1 } : l,
                  ),
            },
          },
    );

  const addTo = async (list: { id: string; title: string }) => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      const res = await callServerAction(() =>
        addWordsToListAction({ listId: list.id, slugs: [slug] }),
      );
      if (res.ok) {
        markHolding(list, false);
        setNote({ kind: 'done', text: t('added', { title: list.title }) });
      } else {
        setNote({ kind: 'error', text: errorText(res.error) });
      }
    } catch {
      setNote({ kind: 'error', text: tl('errors.failed') });
    } finally {
      busy.current = false;
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      const res = await callServerAction(() => createWordListAction({ title, slugs: [slug] }));
      if (res.ok) {
        markHolding(res.value, true);
        setTitle('');
        setNote({ kind: 'done', text: t('added', { title: res.value.title }) });
      } else {
        setNote({ kind: 'error', text: errorText(res.error) });
      }
    } catch {
      setNote({ kind: 'error', text: tl('errors.failed') });
    } finally {
      busy.current = false;
    }
  };

  return (
    <div ref={root} className="relative" data-add-to-list={slug}>
      <button
        ref={toggle}
        type="button"
        className={quiet}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('buttonLabel', { word: headword })}
        onClick={() => (open ? close() : void load())}
      >
        <ListPlus aria-hidden="true" className="mr-1.5 size-4" />
        {t('button')}
      </button>
      {open ? (
        <section
          id={panelId}
          aria-label={t('title', { word: headword })}
          className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-card border border-line bg-surface-2 p-4 text-ink shadow-soft"
        >
          {state.phase === 'loading' ? (
            <p className="text-sm text-ink-muted">{t('loading')}</p>
          ) : state.phase === 'failed' ? (
            <div role="alert" className="flex flex-col gap-2">
              <p className="text-sm text-feedback-incorrect">{tl('errors.failed')}</p>
              <button type="button" className={cn(quiet, 'w-fit')} onClick={() => void load()}>
                {tl('retry')}
              </button>
            </div>
          ) : state.phase === 'ready' ? (
            <>
              {state.view.lists.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('none')}</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {state.view.lists.map((list) => (
                    <li key={list.id}>
                      {list.hasWord ? (
                        <p className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-ink-muted">
                          <Check aria-hidden="true" className="size-4" />
                          {t('inList', { title: list.title })}
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="w-full rounded-control px-2 py-1.5 text-left text-sm text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                          onClick={() => void addTo(list)}
                        >
                          {t('addTo', { title: list.title })}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {state.view.atLimit ? (
                <p className="text-xs text-ink-muted">{t('atLimit')}</p>
              ) : (
                <form onSubmit={(e) => void create(e)} className="flex flex-col gap-2">
                  <label htmlFor={`${panelId}-title`} className="text-sm font-medium">
                    {t('newList')}
                  </label>
                  <Input
                    id={`${panelId}-title`}
                    value={title}
                    maxLength={80}
                    placeholder={t('newListPlaceholder')}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <button
                    type="submit"
                    className={cn(buttonVariants({ size: 'sm' }), 'w-fit')}
                    disabled={title.trim().length === 0}
                  >
                    {t('create')}
                  </button>
                </form>
              )}
            </>
          ) : null}
          <p
            role={note?.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'text-sm',
              note?.kind === 'error' ? 'text-feedback-incorrect' : 'text-ink',
            )}
          >
            {note?.text}
          </p>
          <button type="button" className={cn(quiet, 'w-fit')} onClick={close}>
            {t('close')}
          </button>
        </section>
      ) : null}
    </div>
  );
}
