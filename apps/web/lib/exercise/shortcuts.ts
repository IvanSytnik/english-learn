/**
 * Keyboard map for the exercise player (Case A anatomy, HANDOFF §7):
 *   1–4 choose · 0 "I don't know" · H hint · ? why · Enter check/continue · Esc pause
 *   (on a new topic's rule card — phase `theory` — only Enter "start" and Esc act)
 *
 * Pure so the input guard is unit-testable: while focus is in a text field
 * only Enter and Esc act — typing "1", "0", "h" or "?" into a cloze answer
 * must type, not trigger shortcuts. Digits and letters are physical keys
 * (`lib/keyboard.ts`), so they work on any layout.
 */

import { digitOf, isChord, isLetter, isQuestionMark, type KeyLike } from '@/lib/keyboard';

export type PlayerPhase = 'theory' | 'answering' | 'submitting' | 'feedback' | 'loading' | 'done';

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

export function resolveShortcut(event: KeyLike, ctx: ShortcutContext): ShortcutAction | null {
  if (isChord(event)) return null;
  const { key } = event;

  if (key === 'Escape') return { type: 'pause' };
  if (key === 'Enter') {
    if (ctx.onActivatable) return null;
    return ctx.phase === 'theory' || ctx.phase === 'answering' || ctx.phase === 'feedback'
      ? { type: 'enter' }
      : null;
  }
  if (ctx.inTextField) return null;

  if (ctx.phase === 'answering') {
    const digit = digitOf(event);
    if (digit !== null && digit >= 1 && digit <= 4) {
      const index = digit - 1;
      return index < ctx.optionCount ? { type: 'select', index } : null;
    }
    if (digit === 0) return { type: 'dontKnow' };
    if (isLetter(event, 'H') && ctx.hasHint) return { type: 'toggleHint' };
  }
  if (ctx.phase === 'feedback' && isQuestionMark(event)) return { type: 'toggleWhy' };
  return null;
}

/** Classify the event target for ShortcutContext. */
export function focusKind(target: EventTarget | null): {
  inTextField: boolean;
  onActivatable: boolean;
} {
  if (!(target instanceof HTMLElement)) return { inTextField: false, onActivatable: false };
  const tag = target.tagName;
  // A radio or checkbox takes no typing: digits on it are still shortcuts.
  const typed =
    tag === 'INPUT' && !['radio', 'checkbox'].includes((target as HTMLInputElement).type);
  const inTextField =
    typed || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
  // Option rows are buttons too, but Enter on a just-clicked option means
  // "check", not "click this option again".
  const onActivatable = (tag === 'BUTTON' || tag === 'A') && !('playerOption' in target.dataset);
  return { inTextField, onActivatable };
}
