import { getTranslations } from 'next-intl/server';
import { TopBarControls } from '@/app/_components/top-bar-controls';
import { Link } from '@/i18n/navigation';

/** Landing header set like a chart letterhead: the wordmark, the sheet label, a quiet "Sign in". */
export async function LandingHeader() {
  const t = await getTranslations('marketing.header');
  const tc = await getTranslations('common');

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-content text-lg font-semibold text-ink">{tc('appName')}</span>
          {/* The sheet label is decoration: it gives way first on narrow screens. */}
          <span className="hidden font-mono text-xs uppercase tracking-wider text-ink-muted sm:inline">
            {t('sheet')}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <TopBarControls />
          <Link
            href="/login"
            className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {tc('signIn')}
          </Link>
        </div>
      </div>
    </header>
  );
}
