import { buttonVariants } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChartMark } from './chart-mark';

const STEPS = [
  { key: 'diagnostic', mark: 'tick' },
  { key: 'practice', mark: 'flag' },
  { key: 'progress', mark: 'tick' },
] as const;

/** Three numbered steps on one sheet; the hero's "See how it works" anchors here. */
export async function HowItWorks() {
  const t = await getTranslations('marketing.howItWorks');

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="scroll-mt-6 border-t border-line bg-surface-2"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
        <h2
          id="how-title"
          className="max-w-3xl text-balance font-content text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {t('title')}
        </h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ key, mark }, i) => (
            <li
              key={key}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-soft"
              data-step={key}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-ink-muted">{`0${i + 1}`}</span>
                <ChartMark kind={mark} className="size-6" />
              </div>
              <h3 className="font-content text-xl font-semibold text-ink">
                {t(`steps.${key}.title`)}
              </h3>
              <p className="leading-relaxed text-ink-muted">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
        <Link
          href={{ pathname: '/register', query: { callbackUrl: '/diagnostic' } }}
          className={`mt-10 ${buttonVariants({ variant: 'flag', size: 'lg' })}`}
          data-cta="how-it-works"
        >
          {t('cta')}
        </Link>
      </div>
    </section>
  );
}
