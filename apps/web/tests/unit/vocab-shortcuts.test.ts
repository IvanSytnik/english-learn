import { describe, expect, it } from 'vitest';
import { resolveVocabShortcut, type VocabShortcutContext } from '@/lib/vocab-shortcuts';

const ctx = (over: Partial<VocabShortcutContext> = {}): VocabShortcutContext => ({
  phase: 'answering',
  inTextField: false,
  onActivatable: false,
  optionCount: 4,
  canProve: true,
  hasHint: true,
  ...over,
});

describe('resolveVocabShortcut', () => {
  it('maps 1–4, 0, K, H, Enter and Esc while answering', () => {
    expect(resolveVocabShortcut({ key: '1' }, ctx())).toEqual({ type: 'select', index: 0 });
    expect(resolveVocabShortcut({ key: '4' }, ctx())).toEqual({ type: 'select', index: 3 });
    expect(resolveVocabShortcut({ key: '0' }, ctx())).toEqual({ type: 'dontKnow' });
    expect(resolveVocabShortcut({ key: 'k' }, ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut({ key: 'K' }, ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut({ key: 'h' }, ctx())).toEqual({ type: 'toggleHint' });
    expect(resolveVocabShortcut({ key: 'Enter' }, ctx())).toEqual({ type: 'enter' });
    expect(resolveVocabShortcut({ key: 'Escape' }, ctx())).toEqual({ type: 'pause' });
  });

  it('in the answer field only Enter and Esc act', () => {
    const typing = ctx({ inTextField: true, optionCount: 0 });
    for (const key of ['k', 'K', 'h', 'H', '0', '1', '4', 'a']) {
      expect(resolveVocabShortcut({ key }, typing), key).toBeNull();
    }
    expect(resolveVocabShortcut({ key: 'Enter' }, typing)).toEqual({ type: 'enter' });
    expect(resolveVocabShortcut({ key: 'Escape' }, typing)).toEqual({ type: 'pause' });
  });

  it('K only on a word that can be proven, H only with a hint', () => {
    expect(resolveVocabShortcut({ key: 'k' }, ctx({ canProve: false }))).toBeNull();
    expect(resolveVocabShortcut({ key: 'h' }, ctx({ hasHint: false }))).toBeNull();
  });

  it('digits beyond the options, or in recall, choose nothing', () => {
    expect(resolveVocabShortcut({ key: '1' }, ctx({ optionCount: 0 }))).toBeNull();
    expect(resolveVocabShortcut({ key: '5' }, ctx())).toBeNull();
  });

  it('modifier chords are never ours', () => {
    for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      expect(resolveVocabShortcut({ key: '2', [mod]: true }, ctx()), mod).toBeNull();
      expect(resolveVocabShortcut({ key: 'Escape', [mod]: true }, ctx()), mod).toBeNull();
    }
  });

  it('Enter on a focused button is the button’s own click', () => {
    expect(resolveVocabShortcut({ key: 'Enter' }, ctx({ onActivatable: true }))).toBeNull();
  });

  it('outside answering only Enter (feedback) and Esc act', () => {
    for (const phase of ['loading', 'submitting', 'feedback', 'done'] as const) {
      for (const key of ['1', '0', 'k', 'h']) {
        expect(resolveVocabShortcut({ key }, ctx({ phase })), `${phase} ${key}`).toBeNull();
      }
    }
    expect(resolveVocabShortcut({ key: 'Enter' }, ctx({ phase: 'feedback' }))).toEqual({
      type: 'enter',
    });
    expect(resolveVocabShortcut({ key: 'Enter' }, ctx({ phase: 'submitting' }))).toBeNull();
    expect(resolveVocabShortcut({ key: 'Enter' }, ctx({ phase: 'loading' }))).toBeNull();
  });
});
