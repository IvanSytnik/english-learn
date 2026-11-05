'use client';

import { buttonVariants, cn, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { callServerAction } from '@/lib/action-skew';
import type { ImportEntryView, ImportPreviewView } from '@/lib/vocab-import';
import {
  confirmImportAction,
  type ImportActionError,
  previewImportAction,
} from '../../../actions/word-import';

type Target = { listId: string } | { newList: true };
type Phase = 'text' | 'preview' | 'done';
type Failure = { text: string; retry?: () => void };
type Done = { added: number; alreadyIn: number; didNotFit: number };

const quiet = buttonVariants({ variant: 'secondary', size: 'sm' });

/**
 * Paste import (B6.7): a native modal dialog — paste → preview in three
 * groups (found · found as a form · not in the catalogue) → choose → add.
 * V2-17: the text stays in this component's state and in the one preview
 * request; closing the dialog forgets it. Words go back by slug only.
 */
export function PasteImport({ target, maxChars }: { target: Target; maxChars: number }) {
  const t = useTranslations('student.words.import');
  const tl = useTranslations('student.words.lists');
  const tp = useTranslations('student.words.player');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('text');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<ImportPreviewView | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const newList = 'newList' in target;

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);
  useEffect(() => {
    if (phase === 'preview') previewHeading.current?.focus();
  }, [phase]);

  /** Closing forgets everything, the text first (V2-17). */
  const reset = () => {
    setOpen(false);
    setPhase('text');
    setText('');
    setTitle('');
    setPreview(null);
    setSelected(new Set());
    setFailure(null);
    setDone(null);
  };

  const errorText = (e: ImportActionError | null) =>
    e === 'TOO_LONG'
      ? t('tooLong', { max: maxChars })
      : e === 'EMPTY'
        ? t('empty')
        : e === 'RATE_LIMITED'
          ? tl('errors.rateLimited')
          : e === 'LIMIT'
            ? tl(newList ? 'errors.limit' : 'errors.full')
            : e === 'NOT_FOUND'
              ? tl('errors.notFound')
              : e === 'INVALID' && newList
                ? t('titleNeeded')
                : tl('errors.failed');
  const retryable = (e: ImportActionError) => e === 'UNAVAILABLE';

  /** One request at a time; a lost reply offers Retry. */
  const request = <T,>(
    call: () => Promise<{ ok: true; value: T } | { ok: false; error: ImportActionError }>,
    onOk: (value: T) => void,
    retry: () => void,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    startTransition(async () => {
      let error: ImportActionError | null = null;
      try {
        const res = await callServerAction(call);
        if (res.ok) onOk(res.value);
        else error = res.error;
      } catch {
        error = 'UNAVAILABLE';
      } finally {
        busy.current = false;
      }
      if (error !== null) {
        setFailure({ text: errorText(error), retry: retryable(error) ? retry : undefined });
      }
    });
  };

  const showMatches = () =>
    request(
      () => previewImportAction({ text, ...('listId' in target ? { listId: target.listId } : {}) }),
      (view) => {
        const all = [...view.matched, ...view.lemmatized];
        setPreview(view);
        setSelected(new Set(all.flatMap((e) => (e.preselected ? [e.preselected] : []))));
        setPhase('preview');
      },
      showMatches,
    );

  const confirm = () => {
    if (selected.size === 0) {
      setFailure({ text: t('nothingSelected') });
      return;
    }
    const name = title.trim();
    if (newList && (name.length < 1 || name.length > 80)) {
      setFailure({ text: t('titleNeeded') });
      return;
    }
    const slugs = [...selected];
    request(
      () =>
        confirmImportAction(
          'listId' in target ? { slugs, listId: target.listId } : { slugs, title: name },
        ),
      (res) => {
        if (newList) {
          router.push(`/words/lists/${res.listId}`);
          return;
        }
        setDone(res);
        setPhase('done');
        router.refresh();
      },
      confirm,
    );
  };

  const toggle = (slug: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  const group = (name: 'matched' | 'lemmatized', entries: ImportEntryView[]) =>
    entries.length === 0 ? null : (
      <section className="flex flex-col gap-2" data-import-group={name}>
        <h4 className="font-medium text-ink">{t(name, { count: entries.length })}</h4>
        {name === 'lemmatized' ? (
          <p className="text-sm text-ink-muted">{t('lemmatizedHint')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.term} data-import-term={entry.term}>
              <fieldset className="flex flex-col gap-1 rounded-card border border-line px-3 py-2">
                <legend lang="en" className="px-1 text-sm font-medium text-ink">
                  {entry.term}
                </legend>
                {entry.options.map((o, i) => (
                  <label
                    key={o.slug}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink"
                  >
                    {i === 1 ? (
                      <span className="w-full text-xs text-ink-muted">{t('also')}</span>
                    ) : null}
                    <input
                      type="checkbox"
                      checked={selected.has(o.slug)}
                      disabled={o.inList}
                      onChange={() => toggle(o.slug)}
                      data-option={o.slug}
                    />
                    <span lang="en" className="font-medium">
                      {o.headword}
                    </span>
                    <span className="text-xs text-ink-muted">{tp('pos', { pos: o.pos })}</span>
                    <span className="font-mono text-xs text-ink-muted">{o.level}</span>
                    <span lang={preview?.glossLang} className="text-ink-muted">
                      {o.gloss}
                    </span>
                    {o.inList ? (
                      <span className="text-xs text-ink-muted">({t('inList')})</span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
      </section>
    );

  const textId = `${id}-text`;
  return (
    <>
      <button
        type="button"
        className={quiet}
        aria-label={newList ? undefined : t('openLabel')}
        onClick={() => setOpen(true)}
        data-paste-open=""
      >
        {newList ? tl('create.fromText') : t('open')}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${id}-title`}
        onClose={reset}
        onClick={onBackdrop}
        // Keys typed in the dialog are the dialog's (Esc closes it natively).
        onKeyDown={(e) => e.stopPropagation()}
        className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-card border border-line bg-surface-2 p-0 text-ink shadow-soft backdrop:bg-surface/80"
        data-paste-dialog=""
      >
        {open ? (
          <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
            <h2 id={`${id}-title`} className="font-content text-2xl text-ink">
              {newList ? t('titleNew') : t('titleList')}
            </h2>
            {phase === 'text' ? (
              <>
                <label htmlFor={textId} className="text-sm font-medium">
                  {t('textLabel')}
                </label>
                <textarea
                  id={textId}
                  value={text}
                  rows={10}
                  maxLength={maxChars}
                  aria-describedby={`${id}-hint ${id}-count`}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
                />
                <p id={`${id}-hint`} className="text-xs text-ink-muted">
                  {t('textHint')}
                </p>
                <p id={`${id}-count`} className="text-xs text-ink-muted tabular-nums">
                  {t('counter', { count: text.length, max: maxChars })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonVariants({ size: 'md' })}
                    onClick={showMatches}
                  >
                    {t('preview')}
                  </button>
                  <button type="button" className={quiet} onClick={() => ref.current?.close()}>
                    {t('close')}
                  </button>
                </div>
              </>
            ) : phase === 'preview' && preview ? (
              <>
                <h3 ref={previewHeading} tabIndex={-1} className="sr-only">
                  {t('preview')}
                </h3>
                {group('matched', preview.matched)}
                {group('lemmatized', preview.lemmatized)}
                {preview.notFound.length > 0 ? (
                  <section className="flex flex-col gap-1" data-import-group="notFound">
                    <h4 className="font-medium text-ink">
                      {t('notFound', { count: preview.notFound.length })}
                    </h4>
                    <p className="text-sm text-ink-muted">{t('notFoundNote')}</p>
                    <ul lang="en" className="flex flex-wrap gap-x-3 text-sm text-ink">
                      {preview.notFound.map((term) => (
                        <li key={term}>{term}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {preview.notProcessed > 0 ? (
                  <p className="text-sm text-ink">
                    {t('notProcessed', { count: preview.notProcessed })}
                  </p>
                ) : null}
                {preview.skipped > 0 ? (
                  <p className="text-sm text-ink-muted">
                    {t('skipped', { count: preview.skipped })}
                  </p>
                ) : null}
                <p role="status" className="text-sm text-ink" data-selected={selected.size}>
                  {t('selected', { count: selected.size })}
                </p>
                {selected.size > preview.capacityLeft ? (
                  <p className="text-sm text-ink">
                    {t('capacity', { count: preview.capacityLeft })}
                  </p>
                ) : null}
                {newList ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-name`} className="text-sm font-medium">
                      {t('listTitleLabel')}
                    </label>
                    <Input
                      id={`${id}-name`}
                      value={title}
                      maxLength={80}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonVariants({ size: 'md' })}
                    onClick={confirm}
                  >
                    {t(newList ? 'confirmNew' : 'confirm', { count: selected.size })}
                  </button>
                  <button type="button" className={quiet} onClick={() => setPhase('text')}>
                    {t('edit')}
                  </button>
                </div>
              </>
            ) : done ? (
              <>
                <p role="status" className="text-sm text-ink" data-import-done="">
                  {t('done', done)}
                </p>
                <button
                  type="button"
                  className={cn(quiet, 'w-fit')}
                  onClick={() => ref.current?.close()}
                >
                  {t('close')}
                </button>
              </>
            ) : null}
            {failure ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-feedback-incorrect">{failure.text}</p>
                {failure.retry ? (
                  <button type="button" className={quiet} onClick={failure.retry}>
                    {tl('retry')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
