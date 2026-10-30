import { getTranslations } from 'next-intl/server';
import { ChartMark } from './chart-mark';

type GrammarStage = 'EMERGING' | 'DEVELOPING' | 'SOLID' | 'SECURE';
type WordStage = 'new' | 'learning' | 'mastered';
type Row<S> = {
  key: 'pastSimple' | 'presentPerfect' | 'conditionals' | 'travel' | 'dailyLife' | 'health';
  level: 'A1' | 'A2' | 'B1' | 'B2';
  stage: S;
  mark: 'tick' | 'open' | 'flag';
  /** The title is an English grammar term in every locale. */
  english?: boolean;
};

// An illustration, not a learner's data: real topics and real stage words,
// CEFR bands only — never a number (copy principle 5).
// The one `flag` row is the weak spot.
const GRAMMAR: Row<GrammarStage>[] = [
  { key: 'pastSimple', level: 'A2', stage: 'SOLID', mark: 'tick', english: true },
  { key: 'presentPerfect', level: 'B1', stage: 'EMERGING', mark: 'flag', english: true },
  { key: 'conditionals', level: 'B1', stage: 'DEVELOPING', mark: 'open' },
];
const VOCABULARY: Row<WordStage>[] = [
  { key: 'travel', level: 'A2', stage: 'mastered', mark: 'tick' },
  { key: 'dailyLife', level: 'A2', stage: 'learning', mark: 'open' },
  { key: 'health', level: 'B1', stage: 'new', mark: 'open' },
];
const PROGRAM = [
  { key: 'focus', mark: 'flag' },
  { key: 'review', mark: 'tick' },
  { key: 'words', mark: 'open' },
] as const;

/**
 * The hero's "Coach's chart": an example skill map on its two real axes, one
 * grammar topic flagged as the place to start, and the next session built from
 * it. Text sits on solid `bg-surface` rows above the decorative grid.
 */
export async function SkillMap() {
  const t = await getTranslations('marketing.map');
  const stage = await getTranslations('learning.stage');
  const words = await getTranslations('student.words.stages');

  const row = (r: Row<string>, label: string) =>
    r.mark === 'flag' ? (
      flagged(r, label)
    ) : (
      <li
        key={r.key}
        className="flex items-center gap-3 rounded-control bg-surface px-3 py-2"
        data-row={r.key}
      >
        <ChartMark kind={r.mark} />
        <span className="flex-1 text-sm text-ink" lang={r.english ? 'en' : undefined}>
          {t(`rows.${r.key}`)}
        </span>
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="w-6 text-right font-mono text-xs text-ink-muted">{r.level}</span>
      </li>
    );

  const flagged = (r: Row<string>, label: string) => (
    <li
      key={r.key}
      className="relative my-4 rounded-control bg-surface py-4 pr-14 pl-8"
      data-row={r.key}
      data-flagged=""
    >
      {/* Hand-drawn marker ring around the weak spot. */}
      <svg
        viewBox="0 0 300 80"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute -top-2.5 -left-3 h-[calc(100%+1.25rem)] w-[calc(100%+1.5rem)] animate-flag-pulse"
      >
        <path
          d="M10 42C6 18 70 5 152 5c78 0 140 9 141 33 1 25-60 38-145 37C66 74 4 64 8 38c2-12 30-22 66-26"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-flag"
        />
      </svg>
      <div className="flex items-center gap-3">
        <ChartMark kind="flag" className="size-6" />
        <span className="flex-1 text-lg font-semibold text-ink" lang={r.english ? 'en' : undefined}>
          {t(`rows.${r.key}`)}
        </span>
        <span className="font-mono text-sm text-ink">{r.level}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9">
        <span
          className="inline-flex animate-stamp items-center gap-1 rounded-full bg-flag px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider text-on-flag"
          data-focus-badge=""
        >
          <span aria-hidden="true">⚑</span>
          {t('focus')}
        </span>
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="ml-auto font-content text-base italic text-flag">{t('coachNote')}</span>
      </div>
    </li>
  );

  return (
    <figure
      aria-label={t('label')}
      className="chart-grid relative rounded-card border border-line bg-surface p-4 shadow-soft sm:p-6 lg:-rotate-1"
      data-skill-map=""
    >
      <figcaption className="mb-4 flex items-baseline justify-between gap-3 rounded-control bg-surface px-3 py-1">
        <span className="font-content text-lg font-semibold text-ink">{t('title')}</span>
        <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          {t('caption')}
        </span>
      </figcaption>

      <section aria-labelledby="map-grammar" className="flex flex-col gap-2">
        <h3
          id="map-grammar"
          className="w-fit rounded-control bg-surface px-3 font-mono text-xs uppercase tracking-wider text-ink-muted"
        >
          {t('grammar')}
        </h3>
        <ul className="flex flex-col gap-2">{GRAMMAR.map((r) => row(r, stage(r.stage)))}</ul>
      </section>

      <section aria-labelledby="map-vocabulary" className="mt-5 flex flex-col gap-2">
        <h3
          id="map-vocabulary"
          className="w-fit rounded-control bg-surface px-3 font-mono text-xs uppercase tracking-wider text-ink-muted"
        >
          {t('vocabulary')}
        </h3>
        <ul className="flex flex-col gap-2">{VOCABULARY.map((r) => row(r, words(r.stage)))}</ul>
      </section>

      <section
        aria-labelledby="map-program"
        className="mt-5 rounded-control border-t-2 border-dashed border-line bg-surface px-3 pt-3 pb-2"
      >
        <h3 id="map-program" className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          {t('program.title')}
        </h3>
        <ol className="mt-2 flex flex-col gap-1.5">
          {PROGRAM.map((line) => (
            <li key={line.key} className="flex items-center gap-3 text-sm text-ink">
              <ChartMark kind={line.mark} className="size-4" />
              {t(`program.${line.key}`)}
            </li>
          ))}
        </ol>
      </section>
    </figure>
  );
}
