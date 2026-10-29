'use client';

import { cn } from '@englishlearn/ui';
import { Check, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import type { VocabSessionSummary as Summary } from '@/lib/vocab-summary';

/**
 * End of a vocabulary session: answered, right, back for another try, and
 * words proven with "I know this word". `nothingDue` says the session ended
 * because no card was left (nothing due, today's new words used up), not
 * because it reached its length.
 */
export function VocabSessionSummary({
  summary,
  nothingDue,
  onAgain,
  primaryClassName,
  quietClassName,
}: {
  summary: Summary;
  nothingDue: boolean;
  onAgain: () => void;
  primaryClassName: string;
  quietClassName: string;
}) {
  const t = useTranslations('student.words.player.done');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Screen readers land on the result, keyboard users are one Tab from "Again".
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const tally = [
    { key: 'correct', count: summary.correct, Icon: Check, tone: 'text-feedback-correct' },
    { key: 'again', count: summary.again, Icon: X, tone: 'text-feedback-incorrect' },
    { key: 'proven', count: summary.proven, Icon: ShieldCheck, tone: 'text-accent' },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-content text-3xl text-ink outline-none">
          {t(summary.answered === 0 ? 'emptyTitle' : 'title')}
        </h1>
        {summary.answered > 0 ? (
          <p className="text-ink-muted">{t('answered', { count: summary.answered })}</p>
        ) : null}
        {nothingDue ? (
          <p className="text-ink-muted" data-nothing-due="">
            {t('nothingDue')}
          </p>
        ) : null}
      </header>

      {summary.answered > 0 ? (
        <dl className="grid grid-cols-3 gap-2 sm:gap-3">
          {tally.map(({ key, count, Icon, tone }) => (
            <div
              key={key}
              data-tally={key}
              className="flex flex-col gap-1 rounded-card border border-line bg-surface-2 px-3 py-3 sm:px-4"
            >
              <dt className={cn('flex items-center gap-2 text-sm font-medium', tone)}>
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(`tally.${key}`)}
              </dt>
              <dd className="font-mono text-2xl tabular-nums text-ink">{count}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {nothingDue ? null : (
          <button type="button" className={primaryClassName} onClick={onAgain}>
            {t('again')}
          </button>
        )}
        <Link href="/words" className={nothingDue ? primaryClassName : quietClassName}>
          {t('overview')}
        </Link>
      </div>
    </main>
  );
}
