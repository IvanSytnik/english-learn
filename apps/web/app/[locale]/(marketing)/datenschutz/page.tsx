import { getTranslations } from 'next-intl/server';

const PROCESSORS = ['vercel', 'neon', 'resend', 'sentry'] as const;

export default async function DatenschutzPage() {
  const t = await getTranslations('legal.datenschutz');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="font-content text-4xl text-ink">{t('title')}</h1>
      <p className="mt-6 leading-relaxed text-ink-muted">{t('intro')}</p>
      <section aria-labelledby="processors" className="mt-12">
        <h2 id="processors" className="font-content text-2xl text-ink">
          {t('processorsTitle')}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-muted">
          {PROCESSORS.map((key) => (
            <li key={key}>{t(`processors.${key}`)}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="cookies" className="mt-12">
        <h2 id="cookies" className="font-content text-2xl text-ink">
          {t('cookiesTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('cookiesText')}</p>
      </section>
      <section aria-labelledby="rights" className="mt-12">
        <h2 id="rights" className="font-content text-2xl text-ink">
          {t('rightsTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('rightsText')}</p>
      </section>
    </main>
  );
}
