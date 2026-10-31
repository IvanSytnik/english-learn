'use client';

import type { FeedbackKindValue } from '@englishlearn/db/schemas';
import { buttonVariants } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { submitBetaFeedbackAction } from '../actions/feedback';

export const FEEDBACK_TEXT_MIN = 5;
export const FEEDBACK_TEXT_MAX = 1000;

const KINDS = [
  { value: 'CONTENT_ERROR', label: 'contentError' },
  { value: 'BUG', label: 'bug' },
  { value: 'SUGGESTION', label: 'suggestion' },
  { value: 'OTHER', label: 'other' },
] as const satisfies readonly { value: FeedbackKindValue; label: string }[];

type Status = 'idle' | 'sending' | 'sent' | 'failed' | 'limited';

/**
 * Beta feedback form in a native modal <dialog>: focus trap, Esc and focus
 * return come from the browser. Every open starts from a blank form with
 * `initialKind` preselected. The page it was opened on (path + query, no
 * origin) is sent along, and `itemRef` / `vocabRef` when opened on a question
 * or a word card (the server resolves it to the item and its concept); the
 * author is the session's user, set on the server.
 *
 * Keys typed here never reach the page underneath: the player and the
 * diagnostic listen on `window` (Esc would leave the session, digits would
 * pick an option).
 */
export function FeedbackDialog({
  open,
  onClose,
  initialKind = 'CONTENT_ERROR',
  itemRef,
  vocabRef,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: FeedbackKindValue;
  /** The opaque reference of the question the report is about. */
  itemRef?: string;
  /** The opaque reference of the vocabulary card the report is about. */
  vocabRef?: string;
}) {
  const t = useTranslations('feedback');
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<FeedbackKindValue>(initialKind);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  // One request at a time: set synchronously before the action, so a double
  // click in the same tick is refused before `status` re-renders.
  const sending = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setKind(initialKind);
      setText('');
      setStatus('idle');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialKind]);

  const length = text.trim().length;
  const valid = length >= FEEDBACK_TEXT_MIN && text.length <= FEEDBACK_TEXT_MAX;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || sending.current) return;
    sending.current = true;
    setStatus('sending');
    const input = {
      kind,
      text,
      url: `${window.location.pathname}${window.location.search}`,
      ...(itemRef ? { itemRef } : {}),
      ...(vocabRef ? { vocabRef } : {}),
    };
    startTransition(async () => {
      try {
        const res = await submitBetaFeedbackAction(input);
        setStatus(res.ok ? 'sent' : res.error === 'RATE_LIMITED' ? 'limited' : 'failed');
      } catch {
        // No reply: the form stays filled in, and Send tries again.
        setStatus('failed');
      } finally {
        sending.current = false;
      }
    });
  }

  // The dialog box has no padding of its own, so a click whose target is the
  // dialog itself can only be on the backdrop.
  function onClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) e.currentTarget.close();
  }

  const titleId = `${id}-title`;
  const counterId = `${id}-counter`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onClick}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-card border border-line bg-surface-2 p-0 text-ink shadow-soft backdrop:bg-surface/80"
      data-feedback-dialog=""
    >
      {open ? (
        <div className="flex flex-col gap-5 p-6">
          <h2 id={titleId} className="font-content text-2xl text-ink">
            {t('title')}
          </h2>

          {status === 'sent' ? (
            <>
              <p role="status" className="text-sm text-ink">
                {t('successMessage')}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => ref.current?.close()}
                  className={buttonVariants()}
                >
                  {t('close')}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2" disabled={status === 'sending'}>
                <legend className="mb-2 text-sm font-medium text-ink">{t('kindLabel')}</legend>
                {KINDS.map((k) => (
                  <label key={k.value} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={`${id}-kind`}
                      value={k.value}
                      checked={kind === k.value}
                      onChange={() => setKind(k.value)}
                      className="size-4 accent-accent"
                    />
                    {t(`kinds.${k.label}`)}
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-text`} className="text-sm font-medium text-ink">
                  {t('textLabel')}
                </label>
                <textarea
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={FEEDBACK_TEXT_MAX}
                  rows={5}
                  required
                  placeholder={t('textPlaceholder')}
                  aria-describedby={counterId}
                  disabled={status === 'sending'}
                  className="w-full resize-y rounded-control border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
                <p id={counterId} className="text-right text-xs text-ink-muted">
                  {t('charCount', { count: text.length, max: FEEDBACK_TEXT_MAX })}
                </p>
              </div>

              {status === 'failed' || status === 'limited' ? (
                <p role="alert" className="text-sm text-ink">
                  {t(status === 'limited' ? 'rateLimited' : 'errorMessage')}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => ref.current?.close()}
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!valid || status === 'sending'}
                  className={buttonVariants()}
                >
                  {t('submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
