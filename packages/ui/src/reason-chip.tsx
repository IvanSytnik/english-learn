import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

/** Mirror of @englishlearn/learner-model SelectionReason — ui stays dependency-free. */
export type SelectionReasonValue = 'REVIEW_DUE' | 'NEW_INTRODUCTION' | 'EXPLORATION_FLOOR';

export type ReasonChipKind = 'review' | 'new' | 'checkIn';

/**
 * Chip copy from a selection (HANDOFF §7): a due review is "Review"; otherwise
 * the concept's own state decides — never practised → "New", practised →
 * "Check-in". NEW_INTRODUCTION alone does not mean new (gotcha 37c).
 */
export function reasonChipKind(
  reason: SelectionReasonValue,
  isNewConcept: boolean,
): ReasonChipKind {
  if (reason === 'REVIEW_DUE') return 'review';
  return isNewConcept ? 'new' : 'checkIn';
}

const chipClass: Record<ReasonChipKind, string> = {
  review: 'border-transparent bg-surface-2 text-ink',
  new: 'border-transparent bg-accent text-on-accent',
  checkIn: 'border-line text-ink-muted',
};

export interface ReasonChipProps extends HTMLAttributes<HTMLParagraphElement> {
  reason: SelectionReasonValue;
  isNewConcept: boolean;
  /** Localized chip words, e.g. t('learning.reason.review'). */
  labels: Record<ReasonChipKind, string>;
  /** Optional context line: "Last practised 6 days ago", "Unlocked by Past Simple". */
  detail?: ReactNode;
}

export function ReasonChip({
  reason,
  isNewConcept,
  labels,
  detail,
  className,
  ...props
}: ReasonChipProps) {
  const kind = reasonChipKind(reason, isNewConcept);
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)} {...props}>
      <span
        data-kind={kind}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
          chipClass[kind],
        )}
      >
        {labels[kind]}
      </span>
      {detail ? <span className="min-w-0 break-words text-sm text-ink-muted">{detail}</span> : null}
    </p>
  );
}
