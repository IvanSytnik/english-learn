'use client';

import { cn, StageLabel } from '@englishlearn/ui';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import type { SessionSummary as Summary } from '@/lib/exercise/summary';

/**
 * End of session (Case D): what was answered, which concepts moved up the
 * ladder (always as a word), and what comes back for review. Built from the
 * session's own feedback — nothing here is fetched.
 */
export function SessionSummary({
  summary,
  onAgain,
  primaryClassName,
  quietClassName,
  children,
}: {
  summary: Summary;
  onAgain: () => void;
  primaryClassName: string;
  quietClassName: string;
  /** Slot under the summary (week rhythm). */
  children?: ReactNode;
}) {
  const t = useTranslations('learning');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Screen readers land on the result, keyboard users are one Tab from "Again".
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const tally = [
    { key: 'correct', count: summary.correct, Icon: Check, tone: 'text-feedback-correct' },
    { key: 'incorrect', count: summary.incorrect, Icon: X, tone: 'text-feedback-incorrect' },
    { key: 'dontKnow', count: summary.dontKnow, Icon: CircleHelp, tone: 'text-ink-muted' },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-content text-3xl text-ink outline-none">
          {t('player.done.title')}
        </h1>
        <p className="text-ink-muted">{t('player.done.body', { count: summary.answered })}</p>
      </header>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {tally.map(({ key, count, Icon, tone }) => (
          <div
            key={key}
            data-tally={key}
            className="flex flex-col gap-1 rounded-card border border-line bg-surface-2 px-3 py-3 sm:px-4"
          >
            <dt className={cn('flex items-center gap-2 text-sm font-medium', tone)}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {t(`summary.${key}`)}
            </dt>
            <dd className="font-mono text-2xl tabular-nums text-ink">{count}</dd>
          </div>
        ))}
      </dl>

      {summary.stageUps.length > 0 ? (
        <section aria-labelledby="summary-progress" className="flex flex-col gap-3">
          <h2 id="summary-progress" className="text-sm font-medium text-ink-muted">
            {t('summary.progressTitle')}
          </h2>
          <ul className="flex flex-col gap-2">
            {summary.stageUps.map(({ concept, stage }) => (
              <li
                key={concept}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
              >
                <span className="text-ink">{concept}</span>
                <StageLabel stage={stage} label={t(`stage.${stage}`)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.backSoon.length > 0 || summary.backLater.length > 0 ? (
        <section aria-labelledby="summary-review" className="flex flex-col gap-3">
          <h2 id="summary-review" className="text-sm font-medium text-ink-muted">
            {t('summary.reviewTitle')}
          </h2>
          <ul className="flex flex-col gap-2">
            {summary.backSoon.length > 0 ? (
              <ReviewRow
                kind="backSoon"
                when={t('feedback.backSoon')}
                concepts={summary.backSoon}
              />
            ) : null}
            {summary.backLater.map(({ days, concepts }) => (
              <ReviewRow
                key={days}
                kind="backInDays"
                when={t('feedback.backInDays', { days })}
                concepts={concepts}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {children}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryClassName} onClick={onAgain}>
          {t('player.done.again')}
        </button>
        <Link href="/dashboard" className={quietClassName}>
          {t('player.done.dashboard')}
        </Link>
      </div>
    </main>
  );
}

// One concept per line: titles carry their own commas ("in, on, at").
function ReviewRow({ kind, when, concepts }: { kind: string; when: string; concepts: string[] }) {
  return (
    <li data-review={kind} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <span className="shrink-0 text-sm font-medium text-ink sm:w-44">{when}</span>
      <ul className="flex flex-col gap-1 text-sm text-ink-muted">
        {concepts.map((concept) => (
          <li key={concept}>{concept}</li>
        ))}
      </ul>
    </li>
  );
}
