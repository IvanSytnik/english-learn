'use client';

import { Button } from '@englishlearn/ui';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

/**
 * Error boundary for every page under [locale]. The root layout (and its
 * NextIntlClientProvider) stays mounted, so the copy is localised. The error
 * itself is never rendered: its message may carry server internals.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6">
      <div
        role="alert"
        className="flex w-full flex-col items-center gap-4 rounded-card border border-line bg-surface p-6 text-center text-ink"
      >
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('description')}</p>
        <Button onClick={() => reset()}>{t('retry')}</Button>
      </div>
    </main>
  );
}
