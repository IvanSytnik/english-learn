'use client';

import { Button } from '@englishlearn/ui';
import { usePathname } from 'next/navigation';
import { defaultLocale, locales } from '@/i18n/config';
import de from '../messages/de.json';
import en from '../messages/en.json';
import ru from '../messages/ru.json';
import uk from '../messages/uk.json';
import { fontVariables } from './fonts';
import './globals.css';

const COPY = { en: en.errors, ru: ru.errors, uk: uk.errors, de: de.errors } as const;

type Locale = (typeof locales)[number];

/**
 * Replaces the root layout when it throws, so there is no NextIntlClientProvider:
 * the locale comes from the URL's first segment (`as-needed` prefix, so none
 * means the default). The error itself is never rendered.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const segment = usePathname()?.split('/')[1] ?? '';
  const locale: Locale = (locales as readonly string[]).includes(segment)
    ? (segment as Locale)
    : defaultLocale;
  const t = COPY[locale];

  return (
    <html lang={locale} className={fontVariables}>
      <body className="min-h-screen bg-surface font-sans text-ink antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-ink-muted">{t.description}</p>
          <Button onClick={() => reset()}>{t.retry}</Button>
        </main>
      </body>
    </html>
  );
}
