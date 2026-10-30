import { buttonVariants } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChartMark } from './chart-mark';

/** The closing ask: one sheet, one action — the diagnostic. */
export async function FinalCta() {
  const t = await getTranslations('marketing.finalCta');

  return (
    <section aria-labelledby="final-title" className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <ChartMark kind="flag" className="size-8" />
        <h2
          id="final-title"
          className="mt-4 text-balance font-content text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {t('title')}
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">{t('subtitle')}</p>
        <Link
          href={{ pathname: '/register', query: { callbackUrl: '/diagnostic' } }}
          className={`mt-8 ${buttonVariants({ variant: 'flag', size: 'lg' })}`}
          data-cta="final"
        >
          {t('cta')}
        </Link>
      </div>
    </section>
  );
}
