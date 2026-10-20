import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export interface SegmentedProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Fixed number of items in the session (e.g. 12 or 15). */
  total: number;
  /** Items finished so far; the next segment is the current one. */
  completed: number;
  /** Accessible name, e.g. t('learning.session.progress'). */
  label: string;
  /** Optional spoken value, e.g. "3 of 12". */
  valueText?: string;
}

/**
 * Session header progress: N equal segments — done, current, upcoming.
 * Exposed as one progressbar; the segments themselves are decorative.
 */
export function SegmentedProgress({
  total,
  completed,
  label,
  valueText,
  className,
  ...props
}: SegmentedProgressProps) {
  const max = Math.max(0, Math.floor(total));
  const done = Math.min(max, Math.max(0, Math.floor(completed)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={done}
      aria-valuetext={valueText}
      className={cn('flex w-full gap-1', className)}
      {...props}
    >
      {Array.from({ length: max }, (_, i) => {
        const state = i < done ? 'done' : i === done ? 'current' : 'upcoming';
        return (
          <span
            key={i}
            data-state={state}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-(--duration-base) ease-standard',
              state === 'done' && 'bg-accent',
              state === 'current' && 'bg-accent/35',
              state === 'upcoming' && 'bg-line',
            )}
          />
        );
      })}
    </div>
  );
}
