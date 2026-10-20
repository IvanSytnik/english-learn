import type { HTMLAttributes } from 'react';
import { cn } from './utils';

/** Mirror of @englishlearn/learner-model EffectiveStage — ui stays dependency-free. */
export type StageValue = 'NOT_STARTED' | 'EMERGING' | 'DEVELOPING' | 'SOLID' | 'SECURE';

const STAGES: readonly StageValue[] = ['NOT_STARTED', 'EMERGING', 'DEVELOPING', 'SOLID', 'SECURE'];

/** Literal class names so Tailwind can see them; index = ladder position. */
const MASTERY_BG = [
  'bg-mastery-1',
  'bg-mastery-2',
  'bg-mastery-3',
  'bg-mastery-4',
  'bg-mastery-5',
] as const;

export interface StageLabelProps extends HTMLAttributes<HTMLSpanElement> {
  stage: StageValue;
  /** Localized stage word — always rendered; colour never carries meaning alone. */
  label: string;
  /** FSRS overlay (isFading): shows the badge, never changes the stage. */
  fading?: boolean;
  /** Localized "Due for review". Required for the badge to render. */
  fadingLabel?: string;
}

/**
 * Mastery stage: word first, then a 5-dot strip (one dot per ladder stage,
 * filled up to the current one in that stage's colour), then the optional
 * "Due for review" badge. The dots are decorative (aria-hidden).
 */
export function StageLabel({
  stage,
  label,
  fading = false,
  fadingLabel,
  className,
  ...props
}: StageLabelProps) {
  const position = STAGES.indexOf(stage);
  const fill = MASTERY_BG[position] ?? MASTERY_BG[0];
  return (
    <span
      data-stage={stage}
      className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}
      {...props}
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {STAGES.map((s, i) => (
          <span
            key={s}
            data-filled={i <= position}
            className={cn(
              'size-1.5 rounded-full',
              i <= position ? fill : 'border border-line bg-transparent',
            )}
          />
        ))}
      </span>
      {fading && fadingLabel ? (
        <span className="rounded-control border border-line px-1.5 text-xs font-medium tracking-wide text-ink-muted [font-variant-caps:all-small-caps]">
          {fadingLabel}
        </span>
      ) : null}
    </span>
  );
}
