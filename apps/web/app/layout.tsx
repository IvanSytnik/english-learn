import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '@/lib/theme/init-script';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata = {
  title: 'EnglishLearn',
  description: 'AI-powered English learning platform',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // The head script may set data-theme before React hydrates: expected, not a mismatch.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface font-sans text-ink antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
