'use client';

import { useTranslations } from 'next-intl';
import type { WordBadge } from '@/lib/vocab-words';

/** Literal class names so Tailwind sees them; decorative, the word carries the meaning. */
export const BADGE_DOT: Readonly<Record<WordBadge, string>> = {
  not_started: 'bg-mastery-1',
  learning: 'bg-mastery-2',
  reviewing: 'bg-mastery-3',
  known: 'bg-mastery-5',
};

/** The four stages in order (V2-16), without learner-model code in the client bundle. */
export const STAGE_ORDER = Object.keys(BADGE_DOT) as readonly WordBadge[];

/** A word's stage badge (V2-16) on every word page: a dot and the stage's name, never a number. */
export function StageBadge({ badge }: { badge: WordBadge }) {
  const t = useTranslations('student.words.browse');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted" data-badge={badge}>
      <span aria-hidden="true" className={`size-2 rounded-full ${BADGE_DOT[badge]}`} />
      {t(`badge.${badge}`)}
    </span>
  );
}
