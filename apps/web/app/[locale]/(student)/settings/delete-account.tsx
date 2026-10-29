'use client';

import { Button, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, type MouseEvent, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { type DeleteAccountError, deleteAccountAction } from './actions';

type FormError = 'invalidPassword' | 'rateLimited' | 'generic';

const SERVER_ERROR: Record<DeleteAccountError, FormError> = {
  INVALID_PASSWORD: 'invalidPassword',
  RATE_LIMITED: 'rateLimited',
  VALIDATION_ERROR: 'invalidPassword',
  UNAUTHORIZED: 'generic',
  INTERNAL_ERROR: 'generic',
};

const MESSAGE = {
  invalidPassword: 'invalidPasswordError',
  rateLimited: 'rateLimitedError',
  generic: 'errorMessage',
} as const satisfies Record<FormError, string>;

/**
 * Danger zone: "Delete account" opens a native modal <dialog> (focus trap, Esc
 * and focus return come from the browser) that asks for the password. A wrong
 * password is reported inline and the dialog stays open; on success the
 * session is gone and the learner lands on the home page.
 */
export function DeleteAccount() {
  const t = useTranslations('settings.dangerZone');
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<FormError | null>(null);
  const [pending, startTransition] = useTransition();
  // Set synchronously before the action: a double submit must not send twice.
  const sending = useRef(false);

  function open() {
    setError(null);
    if (passwordRef.current) passwordRef.current.value = '';
    ref.current?.showModal();
  }

  function close() {
    if (!sending.current) ref.current?.close();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const password = passwordRef.current?.value ?? '';
    if (!password) {
      setError('invalidPassword');
      passwordRef.current?.focus();
      return;
    }
    sending.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteAccountAction({ password });
        if (res.ok) {
          router.replace('/');
          router.refresh();
          return;
        }
        setError(SERVER_ERROR[res.error]);
        passwordRef.current?.select();
      } catch {
        // No reply: the dialog stays filled in, and confirming tries again.
        setError('generic');
      } finally {
        sending.current = false;
      }
    });
  }

  // The dialog box has no padding of its own, so a click whose target is the
  // dialog itself can only be on the backdrop.
  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) close();
  }

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink">{t('warning')}</p>
      <div>
        <Button type="button" variant="danger" onClick={open}>
          {t('deleteButton')}
        </Button>
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click is a mouse shortcut; the keyboard has Esc (native cancel) and Cancel. */}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={onBackdrop}
        onCancel={(e) => {
          if (sending.current) e.preventDefault();
        }}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-card border border-line bg-surface-2 p-0 text-ink shadow-soft backdrop:bg-surface/80"
      >
        <form onSubmit={submit} className="flex flex-col gap-5 p-6" noValidate>
          <h2 id={titleId} className="font-content text-2xl text-ink">
            {t('dialogTitle')}
          </h2>
          <p id={descriptionId} className="text-sm text-ink">
            {t('dialogDescription')}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-password`} className="text-sm font-medium text-ink">
              {t('passwordLabel')}
            </label>
            <Input
              ref={passwordRef}
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={error === 'invalidPassword' || undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-feedback-incorrect">
              {t(MESSAGE[error])}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              {t('cancelButton')}
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {t('confirmDeleteButton')}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
