/**
 * Keyboard map for the vocabulary player:
 *   1–4 choose · 0 "I don't know" · K "I know this word" (new word) · H hint
 *   (full recall) · Enter check/continue · Esc pause
 *
 * Pure so the input guard is unit-testable: while focus is in the answer
 * field only Enter and Esc act — typing "k", "h", "0" or "1" into a recall
 * answer must type, not trigger a shortcut. Modifier chords are never ours.
 * Focus classification is the exercise player's (`focusKind`).
 */

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

export type KeyLike = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

export function resolveVocabShortcut(
  event: KeyLike,
  ctx: VocabShortcutContext,
): VocabShortcutAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const { key } = event;

  if (key === 'Escape') return { type: 'pause' };
  if (key === 'Enter') {
    if (ctx.onActivatable) return null;
    return ctx.phase === 'answering' || ctx.phase === 'feedback' ? { type: 'enter' } : null;
  }
  if (ctx.inTextField || ctx.phase !== 'answering') return null;

  if (/^[1-4]$/.test(key)) {
    const index = Number(key) - 1;
    return index < ctx.optionCount ? { type: 'select', index } : null;
  }
  if (key === '0') return { type: 'dontKnow' };
  if ((key === 'k' || key === 'K') && ctx.canProve) return { type: 'know' };
  if ((key === 'h' || key === 'H') && ctx.hasHint) return { type: 'toggleHint' };
  return null;
}
