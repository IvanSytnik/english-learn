import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';

/**
 * Rejects segments that are not a locale. Paths the proxy matcher skips
 * (e.g. /missing.png) reach [locale] unrewritten, and i18n/request.ts would
 * otherwise fall back to the default locale and render the landing page.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return children;
}
