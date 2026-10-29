import { getTranslations } from 'next-intl/server';

export default async function ImpressumPage() {
  const t = await getTranslations('legal.impressum');

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="font-content text-4xl text-ink">{t('title')}</h1>
      <dl className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-[max-content_1fr]">
        <dt className="text-sm text-ink-muted">{t('operatorLabel')}</dt>
        <dd className="text-ink">{t('operatorValue')}</dd>
        <dt className="text-sm text-ink-muted">{t('locationLabel')}</dt>
        <dd className="text-ink">{t('locationValue')}</dd>
        <dt className="text-sm text-ink-muted">{t('contactLabel')}</dt>
        <dd>
          <a href={`mailto:${t('contactEmail')}`} className="text-ink underline underline-offset-4">
            {t('contactEmail')}
          </a>
        </dd>
      </dl>
      <section aria-labelledby="disclaimer" className="mt-12">
        <h2 id="disclaimer" className="font-content text-2xl text-ink">
          {t('disclaimerTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('disclaimerText')}</p>
      </section>
    </main>
  );
}
