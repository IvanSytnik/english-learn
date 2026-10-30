import { getTranslations } from 'next-intl/server';
import { ChartMark } from './chart-mark';

// Program lines, numbered like the chart: the lead prop carries the flag.
const PROPS = [
  { key: 'gaps', mark: 'flag' },
  { key: 'adapt', mark: 'tick' },
  { key: 'progress', mark: 'tick' },
] as const;

/** The three value props as entries of one program, in the chart's glyph system. */
export async function ValueProps() {
  const t = await getTranslations('marketing.values');

  return (
    <section aria-labelledby="values-title" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h2
          id="values-title"
          className="max-w-3xl text-balance font-content text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {t('title')}
        </h2>
        <ol className="mt-10 divide-y divide-line border-y border-line">
          {PROPS.map(({ key, mark }, i) => (
            <li
              key={key}
              className="grid gap-x-6 gap-y-2 py-6 sm:grid-cols-[3rem_1.5rem_minmax(0,18rem)_1fr]"
              data-value={key}
            >
              <span className="font-mono text-sm text-ink-muted">{`0${i + 1}`}</span>
              <ChartMark kind={mark} className="size-6" />
              <h3 className="font-content text-xl font-semibold text-ink">{t(`${key}.title`)}</h3>
              <p className="leading-relaxed text-ink-muted">{t(`${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
