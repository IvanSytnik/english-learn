import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Landing header set like a chart letterhead: the wordmark, the sheet label, a quiet "Sign in". */
export async function LandingHeader() {
  const t = await getTranslations('marketing.header');
  const tc = await getTranslations('common');

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-content text-lg font-semibold text-ink">{tc('appName')}</span>
          <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {t('sheet')}
          </span>
        </p>
        <Link
          href="/login"
          className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          {tc('signIn')}
        </Link>
      </div>
    </header>
  );
}
