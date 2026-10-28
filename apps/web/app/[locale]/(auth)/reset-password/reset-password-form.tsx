'use client';

import { Button, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState, useTransition } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { type ResetPasswordError, resetPasswordAction } from './actions';

const MIN_LENGTH = 8;
const MAX_LENGTH = 120;

type FieldError = 'tooShort' | 'tooLong' | 'mismatch';
type FormError = 'invalidToken' | 'generic';

const SERVER_ERROR: Record<ResetPasswordError, { field?: FieldError; form?: FormError }> = {
  PASSWORD_TOO_SHORT: { field: 'tooShort' },
  PASSWORD_TOO_LONG: { field: 'tooLong' },
  INVALID_TOKEN: { form: 'invalidToken' },
  FAILED: { form: 'generic' },
};

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  // Set synchronously before the action: a double submit must not send twice.
  const sending = useRef(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');

    const local: FieldError | null =
      password.length < MIN_LENGTH
        ? 'tooShort'
        : password.length > MAX_LENGTH
          ? 'tooLong'
          : password !== confirm
            ? 'mismatch'
            : null;
    setFieldError(local);
    setFormError(null);
    if (local) return;

    sending.current = true;
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await resetPasswordAction({ token, email, password });
        if (res.ok) {
          router.replace({ pathname: '/login', query: { reset: '1' } });
          return;
        }
        setFieldError(SERVER_ERROR[res.error].field ?? null);
        setFormError(SERVER_ERROR[res.error].form ?? null);
      } catch {
        // No reply: the fields stay filled in, and submitting tries again.
        setFormError('generic');
      } finally {
        sending.current = false;
        setBusy(false);
      }
    });
  }

  const passwordInvalid = fieldError === 'tooShort' || fieldError === 'tooLong';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <div
          role="alert"
          className="space-y-2 rounded-control border border-feedback-incorrect bg-surface-2 p-3 text-sm text-feedback-incorrect"
        >
          <p>{t(`errors.${formError}`)}</p>
          {formError === 'invalidToken' ? (
            <Link
              href="/forgot-password"
              className="font-medium text-accent underline underline-offset-4"
            >
              {t('requestNew')}
            </Link>
          ) : null}
        </div>
      ) : null}
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          {t('password')}
        </label>
        {/* No minLength: the localized message replaces the browser's tooltip. */}
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={passwordInvalid || undefined}
          aria-describedby={passwordInvalid ? 'password-hint password-error' : 'password-hint'}
          readOnly={busy}
        />
        <p id="password-hint" className="mt-1 text-sm text-ink-muted">
          {t('hint')}
        </p>
        {passwordInvalid ? (
          <p id="password-error" className="mt-1 text-sm text-feedback-incorrect">
            {t(`errors.${fieldError}`)}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          {t('confirm')}
        </label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={fieldError === 'mismatch' || undefined}
          aria-describedby={fieldError === 'mismatch' ? 'confirm-error' : undefined}
          readOnly={busy}
        />
        {fieldError === 'mismatch' ? (
          <p id="confirm-error" className="mt-1 text-sm text-feedback-incorrect">
            {t('errors.mismatch')}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={busy} aria-busy={busy || undefined}>
        {busy ? t('saving') : t('submit')}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-accent underline underline-offset-4">
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
