'use client';

import { Button, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Link } from '@/i18n/navigation';
import { type RegisterField, type RegisterState, registerUser } from './actions';

export function RegisterForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations('auth.register');
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerUser, null);

  const failed = state && !state.ok ? state : null;
  const fieldError = (field: RegisterField) => {
    const code = failed?.fieldErrors?.[field];
    return code ? (
      <p id={`${field}-error`} className="mt-1 text-sm text-red-700">
        {t(`errors.${field}.${code}`)}
      </p>
    ) : null;
  };
  const invalidProps = (field: RegisterField) =>
    failed?.fieldErrors?.[field]
      ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` }
      : {};

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      {failed && failed.error !== 'VALIDATION' ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {failed.error === 'EMAIL_TAKEN' ? t('errors.emailTaken') : t('errors.generic')}
        </p>
      ) : null}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          {t('name')}
        </label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="name"
          defaultValue={failed?.values.name}
          {...invalidProps('name')}
        />
        {fieldError('name')}
      </div>
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
          defaultValue={failed?.values.email}
          {...invalidProps('email')}
        />
        {fieldError('email')}
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          {t('password')}
        </label>
        {/* No minLength: the server's localized message replaces the browser's tooltip. */}
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          {...invalidProps('password')}
        />
        {fieldError('password')}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
      <p className="text-center text-sm text-gray-600">
        {t('hasAccount')}{' '}
        <Link
          href={callbackUrl ? { pathname: '/login', query: { callbackUrl } } : '/login'}
          className="font-medium text-blue-600 hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
