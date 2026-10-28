'use client';

import { Button, Input } from '@englishlearn/ui';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { type ForgotPasswordError, requestPasswordResetAction } from './actions';

type Status = 'idle' | 'sending' | 'sent' | ForgotPasswordError;

const ERROR_KEY = {
  INVALID_EMAIL: 'errors.invalidEmail',
  RATE_LIMITED: 'errors.rateLimited',
  FAILED: 'errors.generic',
} as const;

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const [status, setStatus] = useState<Status>('idle');
  const [, startTransition] = useTransition();
  // Set synchronously before the action: a double submit must not send twice.
  const sending = useRef(false);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  // The form is replaced by the confirmation; keep focus from falling to <body>.
  useEffect(() => {
    if (status === 'sent') sentHeading.current?.focus();
  }, [status]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    sending.current = true;
    setStatus('sending');
    startTransition(async () => {
      try {
        const res = await requestPasswordResetAction({ email });
        setStatus(res.ok ? 'sent' : res.error);
      } catch {
        // No reply: the email stays in the field, and submitting tries again.
        setStatus('FAILED');
      } finally {
        sending.current = false;
      }
    });
  }

  const backLink = (
    <p className="text-center text-sm">
      <Link href="/login" className="font-medium text-accent underline underline-offset-4">
        {t('backToLogin')}
      </Link>
    </p>
  );

  if (status === 'sent') {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-control border border-feedback-correct p-3">
          <h2
            ref={sentHeading}
            tabIndex={-1}
            className="flex items-center gap-2 font-medium text-ink outline-none"
          >
            <Check aria-hidden="true" className="size-5 text-feedback-correct" />
            {t('sentTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t('sentBody')}</p>
        </div>
        {backLink}
      </div>
    );
  }

  const error = status === 'idle' || status === 'sending' ? null : status;
  const busy = status === 'sending';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-ink-muted">{t('description')}</p>
      {error ? (
        <p
          id="forgot-error"
          role="alert"
          className="rounded-control border border-feedback-incorrect bg-surface-2 p-3 text-sm text-feedback-incorrect"
        >
          {t(ERROR_KEY[error])}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          {t('email')}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={error === 'INVALID_EMAIL' || undefined}
          aria-describedby={error ? 'forgot-error' : undefined}
          readOnly={busy}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy} aria-busy={busy || undefined}>
        {busy ? t('sending') : t('submit')}
      </Button>
      {backLink}
    </form>
  );
}
