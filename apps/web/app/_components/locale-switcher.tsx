'use client';

import { useLocale, useTranslations } from 'next-intl';
import { locales } from '@/i18n/config';
import { getPathname, usePathname } from '@/i18n/navigation';

/**
 * EN / RU / UK / DE for the top bar: the same page in another UI language; the
 * current one is marked, not linked.
 *
 * A plain document link, not next-intl's client Link: <html lang> and the
 * client messages live in the root layout above [locale], which a soft
 * navigation keeps — client components stayed in the old language. The prefix
 * is forced so the proxy rewrites the locale cookie (an unprefixed `/` would be
 * redirected back to the cookie's locale).
 */
export function LocaleSwitcher() {
  const t = useTranslations('common.locale');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <ul
      aria-label={t('label')}
      className="flex items-center font-mono text-xs"
      data-locale-switcher=""
    >
      {locales.map((locale) => (
        <li key={locale}>
          {locale === current ? (
            <span
              aria-current="true"
              title={t(locale)}
              className="block rounded-control border border-line px-1.5 py-1 text-ink"
            >
              {locale.toUpperCase()}
            </span>
          ) : (
            <a
              href={getPathname({ href: pathname, locale, forcePrefix: true })}
              hrefLang={locale}
              lang={locale}
              aria-label={t(locale)}
              className="block rounded-control px-1.5 py-1 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {locale.toUpperCase()}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
