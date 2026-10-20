/**
 * Keyboard map for the exercise player (Case A anatomy, HANDOFF §7):
 *   1–4 choose · 0 "I don't know" · H hint · ? why · Enter check/continue · Esc pause
 *
 * Pure so the input guard is unit-testable: while focus is in a text field
 * only Enter and Esc act — typing "1", "0", "h" or "?" into a cloze answer
 * must type, not trigger shortcuts.
 */

export type PlayerPhase = 'answering' | 'submitting' | 'feedback' | 'loading' | 'done';

export type ShortcutAction =
  | { type: 'select'; index: number }
  | { type: 'dontKnow' }
  | { type: 'toggleHint' }
  | { type: 'toggleWhy' }
  | { type: 'enter' }
  | { type: 'pause' };

export type ShortcutContext = {
  phase: PlayerPhase;
  /** Focus is inside an <input>, <textarea>, <select> or contenteditable. */
  inTextField: boolean;
  /** Focus is on a button/link (not an option row): Enter there is its own click. */
  onActivatable: boolean;
  optionCount: number;
  hasHint: boolean;
};

export type KeyLike = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

export function resolveShortcut(event: KeyLike, ctx: ShortcutContext): ShortcutAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const { key } = event;

  if (key === 'Escape') return { type: 'pause' };
  if (key === 'Enter') {
    if (ctx.onActivatable) return null;
    return ctx.phase === 'answering' || ctx.phase === 'feedback' ? { type: 'enter' } : null;
  }
  if (ctx.inTextField) return null;

  if (ctx.phase === 'answering') {
    if (/^[1-4]$/.test(key)) {
      const index = Number(key) - 1;
      return index < ctx.optionCount ? { type: 'select', index } : null;
    }
    if (key === '0') return { type: 'dontKnow' };
    if ((key === 'h' || key === 'H') && ctx.hasHint) return { type: 'toggleHint' };
  }
  if (ctx.phase === 'feedback' && key === '?') return { type: 'toggleWhy' };
  return null;
}

/** Classify the event target for ShortcutContext. */
export function focusKind(target: EventTarget | null): {
  inTextField: boolean;
  onActivatable: boolean;
} {
  if (!(target instanceof HTMLElement)) return { inTextField: false, onActivatable: false };
  const tag = target.tagName;
  const inTextField =
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
  // Option rows are buttons too, but Enter on a just-clicked option means
  // "check", not "click this option again".
  const onActivatable = (tag === 'BUTTON' || tag === 'A') && !('playerOption' in target.dataset);
  return { inTextField, onActivatable };
}
