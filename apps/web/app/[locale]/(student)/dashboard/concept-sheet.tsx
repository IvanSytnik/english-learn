'use client';

import { buttonVariants, StageLabel } from '@englishlearn/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import type { DashboardConcept } from '@/lib/dashboard';

type Translate = ReturnType<typeof useTranslations<'student.dashboard'>>;
type Format = ReturnType<typeof useFormatter>;

/** Quoted, locale-joined titles: «A» и «B». */
function topicList(refs: DashboardConcept['lockedBy'], t: Translate, format: Format): string {
  return format.list(
    refs.map((r) => t('quoted', { title: r.title })),
    { type: 'conjunction' },
  );
}

/** What keeps a locked topic closed — shared by the row and the sheet. */
export function lockText(concept: DashboardConcept, t: Translate, format: Format): string {
  return concept.lockedBy.length > 0
    ? t('lockedBy', {
        count: concept.lockedBy.length,
        topics: topicList(concept.lockedBy, t, format),
      })
    : t('lockedFallback');
}

/**
 * Topic details in a native modal <dialog>: focus trap, Esc and focus
 * return come from the browser. Closed by Esc, the close button or a click
 * on the backdrop. Everything shown is already in the dashboard view — no
 * request on open, and no item content (no questions, no answer keys).
 */
export function ConceptSheet({
  concept,
  diagnosticDone,
  onClose,
}: {
  concept: DashboardConcept | null;
  diagnosticDone: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('student.dashboard');
  const ts = useTranslations('learning.stage');
  const format = useFormatter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (concept && !dialog.open) dialog.showModal();
    if (!concept && dialog.open) dialog.close();
  }, [concept]);

  // The dialog box has no padding of its own, so a click whose target is the
  // dialog itself can only be on the backdrop.
  function onClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) e.currentTarget.close();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native to <dialog>; the click only adds the backdrop
    <dialog
      ref={ref}
      aria-labelledby="concept-sheet-title"
      onClose={onClose}
      onClick={onClick}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-card border border-line bg-surface-2 p-0 text-ink shadow-soft backdrop:bg-surface/80"
      data-concept-sheet={concept?.id}
    >
      {concept ? (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="concept-sheet-title" className="font-content text-2xl text-ink">
                {concept.title}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {t('category', { category: concept.category })} ·{' '}
                <span className="font-mono">{concept.cefrLevel}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              {t('sheet.close')}
            </button>
          </div>

          <div>
            {concept.isLocked ? (
              <p className="text-sm text-ink-muted">{lockText(concept, t, format)}</p>
            ) : (
              <StageLabel
                stage={concept.stage}
                label={ts(concept.stage)}
                fading={concept.isFading}
                fadingLabel={ts('dueForReview')}
              />
            )}
          </div>

          <ul className="flex flex-col gap-1 text-sm text-ink">
            <li data-sheet-items>
              {t('sheet.items', { done: concept.practicedItemCount, total: concept.itemCount })}
            </li>
            <li data-sheet-last-practiced>
              {concept.lastPracticedAt
                ? t('sheet.lastPracticed', {
                    date: format.dateTime(new Date(concept.lastPracticedAt), {
                      dateStyle: 'medium',
                    }),
                  })
                : t('sheet.notPracticed')}
            </li>
            {concept.requires.length > 0 ? (
              <li data-sheet-requires>
                {t('sheet.requires', { topics: topicList(concept.requires, t, format) })}
              </li>
            ) : null}
            {concept.unlocks.length > 0 ? (
              <li data-sheet-unlocks>
                {t('sheet.unlocks', { topics: topicList(concept.unlocks, t, format) })}
              </li>
            ) : null}
          </ul>

          <div>
            {diagnosticDone ? (
              <Link href="/exercises" className={buttonVariants()}>
                {t('continuePractice')}
              </Link>
            ) : (
              // No prefetch: see the dashboard CTA.
              <Link href="/diagnostic" prefetch={false} className={buttonVariants()}>
                {t('findLevel')}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
