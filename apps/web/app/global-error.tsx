'use client';

import { Button } from '@englishlearn/ui';
import * as Sentry from '@sentry/nextjs';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { defaultLocale, locales } from '@/i18n/config';
import type en from '../messages/en.json';
import { fontVariables } from './fonts';
import './globals.css';

type Locale = (typeof locales)[number];
type Copy = (typeof en)['errors'];

// Loaded only once this boundary renders: a static JSON import would ship all
// four catalogues in a chunk every page loads (Turbopack does not tree-shake JSON).
const LOAD_COPY: Record<Locale, () => Promise<{ default: { errors: Copy } }>> = {
  en: () => import('../messages/en.json'),
  ru: () => import('../messages/ru.json'),
  uk: () => import('../messages/uk.json'),
  de: () => import('../messages/de.json'),
};

/**
 * Replaces the root layout when it throws, so there is no NextIntlClientProvider:
 * the locale comes from the URL's first segment (`as-needed` prefix, so none
 * means the default). The error itself is never rendered.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const segment = usePathname()?.split('/')[1] ?? '';
  const locale: Locale = (locales as readonly string[]).includes(segment)
    ? (segment as Locale)
    : defaultLocale;
  const [t, setT] = useState<Copy | null>(null);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    let live = true;
    LOAD_COPY[locale]().then(
      (m) => live && setT(m.default.errors),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [locale]);

  return (
    <html lang={locale} className={fontVariables}>
      <body className="min-h-screen bg-surface font-sans text-ink antialiased">
        <main
          aria-busy={t === null}
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center"
        >
          {t && (
            <>
              <h1 className="text-2xl font-bold">{t.title}</h1>
              <p className="text-ink-muted">{t.description}</p>
              <Button onClick={() => reset()}>{t.retry}</Button>
            </>
          )}
        </main>
      </body>
    </html>
  );
}
