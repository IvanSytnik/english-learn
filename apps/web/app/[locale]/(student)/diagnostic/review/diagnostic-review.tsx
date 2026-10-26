import { cn } from '@englishlearn/ui';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { DiagnosticReviewView } from '@/lib/diagnostic';

const GAP = '___';

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-on-accent transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const quietButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

type Question = DiagnosticReviewView['questions'][number];

/**
 * The review after the test: every question with the learner's answer, the
 * key and the explanation. A verdict per question, never a total — the
 * result screen's "no counts" holds here too.
 */
export function DiagnosticReview({ review }: { review: DiagnosticReviewView }) {
  const t = useTranslations('student.diagnosticReview');
  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-content text-3xl text-ink">{t('title')}</h1>
        <p className="text-ink">{t('intro')}</p>
      </header>

      <ol className="flex flex-col gap-4">
        {review.questions.map((q) => (
          <ReviewQuestion key={q.position} question={q} />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/exercises" className={primaryButton}>
          {t('goToPractice')}
        </Link>
        {/* No prefetch: /diagnostic may write for a finished attempt. */}
        <Link href="/diagnostic" prefetch={false} className={quietButton}>
          {t('backToResult')}
        </Link>
      </div>
    </main>
  );
}

function ReviewQuestion({ question: q }: { question: Question }) {
  const t = useTranslations('student.diagnosticReview');
  const labelId = `review-question-${q.position}`;
  const Icon = q.outcome === 'correct' ? Check : q.outcome === 'incorrect' ? X : CircleHelp;
  const tone =
    q.outcome === 'correct'
      ? 'text-feedback-correct'
      : q.outcome === 'incorrect'
        ? 'text-feedback-incorrect'
        : 'text-ink-muted';
  const [before, after] = q.stem.split(GAP);

  return (
    <li
      data-review-question=""
      data-outcome={q.outcome}
      aria-labelledby={labelId}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={labelId} className="text-sm font-medium text-ink-muted">
          {t('question', { n: q.position + 1, axis: q.axis })}
        </h2>
        <p className={cn('flex items-center gap-1.5 text-sm font-medium', tone)}>
          <Icon aria-hidden="true" className="size-4" />
          {t(`outcome.${q.outcome}`)}
        </p>
      </div>

      <p lang="en" className="font-content text-xl leading-snug text-ink">
        {after === undefined ? (
          q.stem
        ) : (
          <>
            {before}
            <span className="mx-1 inline-block min-w-[4ch] border-b-2 border-ink px-1 text-center">
              {' '}
            </span>
            {after}
          </>
        )}
      </p>

      <ul className="flex flex-col gap-2">
        {q.choices.map((choice, index) => {
          const isKey = index === q.correctIndex;
          const isChosen = index === q.chosenIndex;
          return (
            <li
              key={choice}
              data-choice=""
              data-key={isKey ? '' : undefined}
              data-chosen={isChosen ? '' : undefined}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border bg-surface px-4 py-2',
                isKey
                  ? 'border-feedback-correct'
                  : isChosen
                    ? 'border-feedback-incorrect'
                    : 'border-line',
              )}
            >
              <span lang="en" className="flex-1 font-content text-lg text-ink">
                {choice}
              </span>
              {isChosen ? (
                <span
                  className={cn(
                    'flex items-center gap-1 text-sm',
                    isKey ? 'text-feedback-correct' : 'text-feedback-incorrect',
                  )}
                >
                  {isKey ? null : <X aria-hidden="true" className="size-4" />}
                  {t('yourAnswer')}
                </span>
              ) : null}
              {isKey ? (
                <span className="flex items-center gap-1 text-sm text-feedback-correct">
                  <Check aria-hidden="true" className="size-4" />
                  {t('rightAnswer')}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {q.outcome !== 'dontKnow' && q.chosenIndex === null ? (
        <p className="text-sm text-ink-muted">{t('answerGone')}</p>
      ) : null}

      {q.explanation ? (
        <div data-why="" className="flex flex-col gap-1 rounded-control bg-surface-2 px-4 py-3">
          <p className="text-sm font-medium text-ink-muted">{t('why')}</p>
          <p lang={q.explanation.lang} className="text-sm text-ink">
            {q.explanation.text}
          </p>
        </div>
      ) : null}
    </li>
  );
}
