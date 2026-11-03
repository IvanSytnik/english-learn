import { getTranslations } from 'next-intl/server';

export default async function CreditsPage() {
  const t = await getTranslations('legal.credits');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="font-content text-4xl text-ink">{t('title')}</h1>
      <section aria-labelledby="cefrj" className="mt-12">
        <h2 id="cefrj" className="font-content text-2xl text-ink">
          {t('cefrjTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('cefrjText')}</p>
        <p className="mt-3 leading-relaxed text-ink">
          <cite>{t('cefrjCitation')}</cite>
        </p>
      </section>
      <section aria-labelledby="word-frequency" className="mt-12">
        <h2 id="word-frequency" className="font-content text-2xl text-ink">
          {t('frequencyTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('frequencyText')}</p>
        <p className="mt-3 leading-relaxed text-ink">
          <cite>{t('frequencyCitation')}</cite>
        </p>
      </section>
      <section aria-labelledby="pronunciation" className="mt-12">
        <h2 id="pronunciation" className="font-content text-2xl text-ink">
          {t('pronunciationTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('pronunciationText')}</p>
        <pre
          lang="en"
          data-licence="cmudict"
          className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-muted"
        >
          {t('pronunciationLicence')}
        </pre>
      </section>
      <section aria-labelledby="ai-content" className="mt-12">
        <h2 id="ai-content" className="font-content text-2xl text-ink">
          {t('aiTitle')}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{t('aiText')}</p>
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
