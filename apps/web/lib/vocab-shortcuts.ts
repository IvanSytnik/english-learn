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

export type VocabPlayerPhase = 'loading' | 'answering' | 'submitting' | 'feedback' | 'done';

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
