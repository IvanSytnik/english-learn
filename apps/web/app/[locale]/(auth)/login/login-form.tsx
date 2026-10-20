'use client';

import { Button, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Link } from '@/i18n/navigation';
import { type LoginState, login } from './actions';

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations('auth.login');
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-control border border-feedback-incorrect bg-surface-2 p-3 text-sm text-feedback-incorrect"
        >
          {state.error === 'INVALID_CREDENTIALS'
            ? t('errors.invalidCredentials')
            : t('errors.generic')}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          {t('email')}
        </label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          {t('password')}
        </label>
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
