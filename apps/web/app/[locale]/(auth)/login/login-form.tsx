'use client';

import { Button, Input } from '@englishlearn/ui';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Link } from '@/i18n/navigation';
import { type LoginState, login } from './actions';

const ERROR_KEY = {
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  RATE_LIMITED: 'errors.rateLimited',
  AUTH_FAILED: 'errors.generic',
} as const;

export function LoginForm({
  callbackUrl,
  passwordReset = false,
}: {
  callbackUrl?: string;
  /** Arrived from a successful password reset (`?reset=1`). */
  passwordReset?: boolean;
}) {
  const t = useTranslations('auth.login');
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      {passwordReset && !state ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control border border-feedback-correct p-3 text-sm text-ink"
        >
          <Check aria-hidden="true" className="size-5 shrink-0 text-feedback-correct" />
          {t('resetDone')}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-control border border-feedback-incorrect bg-surface-2 p-3 text-sm text-feedback-incorrect"
        >
          {t(ERROR_KEY[state.error])}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          {t('email')}
        </label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label htmlFor="password" className="block text-sm font-medium">
            {t('password')}
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-accent underline underline-offset-4"
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {t('noAccount')}{' '}
        <Link
          href={callbackUrl ? { pathname: '/register', query: { callbackUrl } } : '/register'}
          className="font-medium text-accent underline underline-offset-4"
        >
          {t('signUp')}
        </Link>
      </p>
    </form>
  );
}
