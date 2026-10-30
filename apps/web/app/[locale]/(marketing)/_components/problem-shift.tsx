import { getTranslations } from 'next-intl/server';
import { ChartMark } from './chart-mark';

// Six lines of a syllabus. The typical sheet marks none of them; the personal
// sheet ticks what is known, flags one gap and leaves the rest for later.
const TYPICAL = ['open', 'open', 'open', 'open', 'open', 'open'] as const;
const PERSONAL = ['tick', 'tick', 'flag', 'tick', 'open', 'open'] as const;

function Sheet({
  label,
  path,
  result,
  marks,
  variant,
}: {
  label: string;
  path: string;
  result: string;
  marks: readonly ('tick' | 'flag' | 'open')[];
  variant: 'typical' | 'ours';
}) {
  return (
    <div
      className="chart-grid flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-soft"
      data-sheet={variant}
    >
      <h3 className="w-fit rounded-control bg-surface px-2 font-mono text-xs uppercase tracking-wider text-ink-muted">
        {label}
      </h3>
      <ol aria-hidden="true" className="flex flex-col gap-2">
        {marks.map((mark, i) => (
          <li key={i} className="flex items-center gap-3 rounded-control bg-surface px-2 py-1">
            <span className="w-5 font-mono text-xs text-ink-muted">{`0${i + 1}`}</span>
            <ChartMark kind={mark} className="size-4" />
            <span
              className={`h-1.5 flex-1 rounded-full ${mark === 'flag' ? 'bg-flag' : 'bg-line'}`}
            />
          </li>
        ))}
      </ol>
      <div className="rounded-control bg-surface px-2">
        <p className="font-medium text-ink">{path}</p>
        <p className="mt-1 text-sm text-ink-muted">→ {result}</p>
      </div>
    </div>
  );
}

/** "Why we're different": the same syllabus as one flat sheet and as a marked-up one. */
export async function ProblemShift() {
  const t = await getTranslations('marketing.problem');

  return (
    <section aria-labelledby="problem-title" className="bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h2
          id="problem-title"
          className="max-w-3xl text-balance font-content text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {t('title')}
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">{t('body')}</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Sheet
            variant="typical"
            label={t('typical.label')}
            path={t('typical.path')}
            result={t('typical.result')}
            marks={TYPICAL}
          />
          <Sheet
            variant="ours"
            label={t('ours.label')}
            path={t('ours.path')}
            result={t('ours.result')}
            marks={PERSONAL}
          />
        </div>
        <p className="mt-8 flex items-center gap-3 text-lg text-ink">
          <ChartMark kind="flag" className="size-6" />
          <span>
            <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              {t('difference.label')}
            </span>
            <span className="ml-3 font-content font-semibold">{t('difference.text')}</span>
          </span>
        </p>
      </div>
    </section>
  );
}
