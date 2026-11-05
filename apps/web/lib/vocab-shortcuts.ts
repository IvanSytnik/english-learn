/**
 * Keyboard map for the vocabulary player:
 *   1–4 choose · 0 "I don't know" · K "I know this word" (new word) · H hint
 *   (full recall) · Enter check/continue · Esc pause
 *
 * Pure so the input guard is unit-testable: while focus is in the answer
 * field only Enter and Esc act — typing "k", "h", "0" or "1" into a recall
 * answer must type, not trigger a shortcut. Modifier chords are never ours.
 * Focus classification is the exercise player's (`focusKind`). Digits and
 * letters are physical keys (`lib/keyboard.ts`): K is "I know" on a Russian
 * or Ukrainian layout too, where it types `л`.
 */

import { digitOf, isChord, isLetter, type KeyLike } from '@/lib/keyboard';

export type VocabPlayerPhase =
  | 'loading'
  /** A new word's intro card (B6.5): its own keys, resolveIntroShortcut. */
  | 'intro'
  | 'answering'
  | 'submitting'
  | 'feedback'
  | 'done';

export type VocabShortcutAction =
  | { type: 'select'; index: number }
  | { type: 'dontKnow' }
  | { type: 'know' }
  | { type: 'toggleHint' }
  | { type: 'enter' }
  | { type: 'pause' };

export type VocabShortcutContext = {
  phase: VocabPlayerPhase;
  inTextField: boolean;
  onActivatable: boolean;
  /** 4 in the choice modes, 0 in recall. */
  optionCount: number;
  /** A new word's first card: "I know this word" is offered. */
  canProve: boolean;
  /** Full recall outside a proof: `H` reveals the first-letter mask. */
  hasHint: boolean;
};

export function resolveVocabShortcut(
  event: KeyLike,
  ctx: VocabShortcutContext,
): VocabShortcutAction | null {
  if (isChord(event)) return null;
  const { key } = event;

  if (key === 'Escape') return { type: 'pause' };
  if (key === 'Enter') {
    if (ctx.onActivatable) return null;
    return ctx.phase === 'answering' || ctx.phase === 'feedback' ? { type: 'enter' } : null;
  }
  if (ctx.inTextField || ctx.phase !== 'answering') return null;

  const digit = digitOf(event);
  if (digit !== null && digit >= 1 && digit <= 4) {
    const index = digit - 1;
    return index < ctx.optionCount ? { type: 'select', index } : null;
  }
  if (digit === 0) return { type: 'dontKnow' };
  if (isLetter(event, 'K') && ctx.canProve) return { type: 'know' };
  if (isLetter(event, 'H') && ctx.hasHint) return { type: 'toggleHint' };
  return null;
}

/**
 * Keys on a new word's intro card (B6.5, V2-11): Enter / Space continue, `K`
 * says "I know this word" — in B6.5 both open the word's first question.
 * `K` is strict: the physical K key alone (no Meta, Ctrl, Alt or Shift), not
 * auto-repeated, not mid-composition (an IME), and never while focus is in
 * an input, a textarea or a contenteditable element. Enter and Space on a
 * focused button are the button's own (its click), never a second call.
 */
export type IntroKeyLike = KeyLike & { repeat?: boolean; isComposing?: boolean };

export type IntroShortcutAction = { type: 'continue' } | { type: 'know' } | { type: 'pause' };

export function resolveIntroShortcut(
  event: IntroKeyLike,
  ctx: { inEditable: boolean; onActivatable: boolean },
): IntroShortcutAction | null {
  if (event.repeat === true || event.isComposing === true || isChord(event)) return null;
  if (event.key === 'Escape') return { type: 'pause' };
  if (ctx.inEditable) return null;
  if (event.key === 'Enter' || event.code === 'Space' || event.key === ' ') {
    return ctx.onActivatable ? null : { type: 'continue' };
  }
  if (event.code === 'KeyK' && event.shiftKey !== true) return { type: 'know' };
  return null;
}

/** Focus is in something that takes typing: any input, a textarea, a contenteditable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea') !== null) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}
