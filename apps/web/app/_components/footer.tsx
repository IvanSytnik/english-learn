import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const LINKS = [
  { href: '/impressum', key: 'impressum.title' },
  { href: '/datenschutz', key: 'datenschutz.title' },
  { href: '/credits', key: 'credits.title' },
] as const;

/** Site footer with the legal links. Not on /exercises: the player stays distraction-free. */
export async function Footer() {
  const t = await getTranslations('legal');

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t('footer.label')}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map(({ href, key }) => (
              <li key={href}>
                {/* Own colour, not inherited: after a live switch to dark, Chromium left
                    links (preflight `color: inherit`) at the light value — e2e axe caught it. */}
                <Link
                  href={href}
                  className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>{t('footer.copyright')}</p>
      </div>
    </footer>
  );
}
