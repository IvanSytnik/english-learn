import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export interface KeyHintProps extends HTMLAttributes<HTMLElement> {
  /** The key as printed: "1", "Enter", "Esc", "?". */
  children: string;
}

/**
 * Keyboard shortcut badge. Hidden on devices whose primary input cannot
 * hover (touch), where shortcuts don't exist — the visible button twin is the
 * control there. Purely a hint: never the only way to trigger an action.
 */
export function KeyHint({ className, children, ...props }: KeyHintProps) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-[4px] border border-line bg-surface-2 px-1.5 font-mono text-xs tabular-nums leading-5 text-ink-muted',
        '[@media(hover:none)]:hidden',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/** Alias — the design spec calls it Kbd. */
export const Kbd = KeyHint;
