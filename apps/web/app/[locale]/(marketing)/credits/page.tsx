import { getTranslations } from 'next-intl/server';

export default async function CreditsPage() {
  const t = await getTranslations('legal.credits');

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="font-content text-4xl text-ink">{t('title')}</h1>
      <section aria-labelledby="cefrj" className="mt-12">
        <h2 id="cefrj" className="font-content text-2xl text-ink">
          {t('cefrjTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('cefrjText')}</p>
      </section>
      <section aria-labelledby="fonts" className="mt-12">
        <h2 id="fonts" className="font-content text-2xl text-ink">
          {t('fontsTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('fontsText')}</p>
      </section>
    </main>
  );
}
