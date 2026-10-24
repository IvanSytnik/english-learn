import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export interface WeekRhythmDayView {
  /** Stable key, e.g. the date "2026-10-21". */
  key: string;
  /** Localized short weekday, e.g. "Wed". */
  label: string;
  counted: boolean;
  isToday: boolean;
}

export interface WeekRhythmProps extends HTMLAttributes<HTMLElement> {
  /** Localized heading, e.g. "This week". */
  title: string;
  /** Localized tally, e.g. "2 of 3 sessions". */
  summary: string;
  /** Optional line under the tally, e.g. the rule or "Goal reached". */
  note?: string;
  /** Monday … Sunday. */
  days: readonly WeekRhythmDayView[];
  /** Spoken state of a day: "session done" / "no session". */
  dayLabels: { counted: string; open: string; today: string };
}

/**
 * Weekly rhythm (Case D): sessions this week against a goal, no streak.
 * A counted day is a filled circle with a check, an open day an empty ring —
 * shape, not colour, carries the state; each day is spoken as words.
 */
export function WeekRhythm({
  title,
  summary,
  note,
  days,
  dayLabels,
  className,
  ...props
}: WeekRhythmProps) {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-3 rounded-card border border-line p-4', className)}
      {...props}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-ink-muted">{title}</h2>
        <p className="text-sm font-medium text-ink">{summary}</p>
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <li
            key={day.key}
            data-counted={day.counted}
            aria-current={day.isToday ? 'date' : undefined}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn('text-xs text-ink-muted', day.isToday && 'font-semibold text-ink')}
            >
              {day.label}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 items-center justify-center rounded-full',
                day.counted ? 'bg-accent text-on-accent' : 'border-2 border-line',
                day.isToday && !day.counted && 'border-ink-muted',
              )}
            >
              {day.counted ? (
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className="sr-only">
              {[
                day.label,
                day.isToday ? dayLabels.today : null,
                day.counted ? dayLabels.counted : dayLabels.open,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </li>
        ))}
      </ol>
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
    </section>
  );
}
