import { getLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n/config';
import { getPathname, Link } from '@/i18n/navigation';

/**
 * The landing's own footer row, above the shared legal footer: only real
 * targets — the how-it-works anchor, sign in and the language switch. Lives on
 * the landing alone: the anchor would be dead on the legal pages.
 */
export async function LandingNav() {
  const t = await getTranslations('marketing.nav');
  const tc = await getTranslations('common');
  const current = await getLocale();

  return (
    <div className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-content text-base text-ink">{t('tagline')}</p>
        <nav
          aria-label={t('label')}
          className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm"
        >
          <a
            href="#how-it-works"
            className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {t('howItWorks')}
          </a>
          <Link
            href="/login"
            className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {tc('signIn')}
          </Link>
          <ul aria-label={t('language')} className="flex items-center gap-1 font-mono text-xs">
            {locales.map((locale) => (
              <li key={locale}>
                {locale === current ? (
                  <span
                    aria-current="true"
                    title={t(`languages.${locale}`)}
                    className="rounded-control border border-line px-2 py-1 text-ink"
                  >
                    {locale.toUpperCase()}
                  </span>
                ) : (
                  // A document load, like the top-bar switcher (locale-switcher.tsx).
                  <a
                    href={getPathname({ href: '/', locale, forcePrefix: true })}
                    hrefLang={locale}
                    lang={locale}
                    aria-label={t(`languages.${locale}`)}
                    className="rounded-control px-2 py-1 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    {locale.toUpperCase()}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
