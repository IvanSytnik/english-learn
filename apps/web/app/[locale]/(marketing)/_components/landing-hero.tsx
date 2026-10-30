import { buttonVariants } from '@englishlearn/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SkillMap } from './skill-map';

/** First viewport: the copy beside the chart, not a headline over whitespace. */
export async function LandingHero() {
  const t = await getTranslations('marketing.hero');

  return (
    <section aria-labelledby="hero-title" className="border-b border-line bg-surface-2">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-20">
        <div className="flex flex-col">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {t('eyebrow')}
          </p>
          <h1
            id="hero-title"
            className="mt-4 text-balance font-content text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-ink"
          >
            {t('title')}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">{t('subtitle')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Sign-up goes straight on to the diagnostic. The callback has no locale
                prefix, so it resolves to the register page's locale (en unprefixed). */}
            <Link
              href={{ pathname: '/register', query: { callbackUrl: '/diagnostic' } }}
              className={buttonVariants({ variant: 'flag', size: 'lg' })}
              data-cta="primary"
            >
              {t('primaryCta')}
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({ variant: 'ghost', size: 'lg' })}
              data-cta="secondary"
            >
              {t('secondaryCta')}
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-muted">{t('note')}</p>
        </div>
        <SkillMap />
      </div>
    </section>
  );
}
