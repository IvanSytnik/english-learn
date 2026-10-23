import { buttonVariants } from './button';
import { KeyHint } from './key-hint';
import { cn } from './utils';

export interface SessionLengthOption {
  /** Submitted value, e.g. 10. */
  minutes: number;
  /** Localized length, e.g. "10 min". */
  label: string;
  /** Localized size, e.g. "12 questions". */
  detail: string;
}

export interface SessionLengthPickerProps {
  /** Localized question, e.g. "How long do you have?" — the group's name. */
  legend: string;
  options: readonly SessionLengthOption[];
  defaultMinutes: number;
  /** Localized submit label, e.g. "Start". */
  startLabel: string;
  /** Query parameter the choice is submitted as. */
  name?: string;
  className?: string;
}

/**
 * Session length before practice (Case D): a native radio group in a GET form.
 * Arrow keys move the choice, Enter starts — no script needed. The chosen
 * option is marked by the radio itself and a border, never by colour alone.
 */
export function SessionLengthPicker({
  legend,
  options,
  defaultMinutes,
  startLabel,
  name = 'minutes',
  className,
}: SessionLengthPickerProps) {
  return (
    <form method="get" className={cn('flex flex-col gap-6', className)}>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-content text-2xl text-ink">{legend}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((option) => (
            <label
              key={option.minutes}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-soft transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2',
                'has-checked:border-accent has-checked:bg-surface-2 has-checked:ring-1 has-checked:ring-accent',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.minutes}
                defaultChecked={option.minutes === defaultMinutes}
                aria-describedby={`${name}-${option.minutes}-detail`}
                className="size-4 shrink-0 accent-accent outline-none"
              />
              <span className="flex flex-col">
                <span className="text-base font-medium text-ink">{option.label}</span>
                {/* Out of the radio's name, read once as its description. */}
                <span
                  id={`${name}-${option.minutes}-detail`}
                  aria-hidden="true"
                  className="text-sm text-ink-muted"
                >
                  {option.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <button type="submit" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
          {startLabel}
          <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
        </button>
      </div>
    </form>
  );
}
