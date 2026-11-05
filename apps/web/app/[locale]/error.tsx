'use client';

import { Button } from '@englishlearn/ui';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { reloadOnceForSkew } from '@/lib/action-skew';

/**
 * Error boundary for every page under [locale]. The root layout (and its
 * NextIntlClientProvider) stays mounted, so the copy is localised. The error
 * itself is never rendered: its message may carry server internals.
 *
 * A server action unknown to the server (this page is from before a deploy,
 * e.g. the login form) reloads the page once instead (V2-15,
 * lib/action-skew.ts); a second one within the guard window shows this
 * error as usual.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (reloadOnceForSkew(error)) {
      setReloading(true);
      return;
    }
    Sentry.captureException(error);
  }, [error]);

  if (reloading) return null;
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
