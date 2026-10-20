import { describe, expect, it } from 'vitest';
import { focusKind, resolveShortcut, type ShortcutContext } from '@/lib/exercise/shortcuts';

const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({
  phase: 'answering',
  inTextField: false,
  onActivatable: false,
  optionCount: 4,
  hasHint: true,
  ...over,
});

describe('resolveShortcut', () => {
  it('maps 1–4, 0, H, Enter and Esc while answering', () => {
    expect(resolveShortcut({ key: '2' }, ctx())).toEqual({ type: 'select', index: 1 });
    expect(resolveShortcut({ key: '0' }, ctx())).toEqual({ type: 'dontKnow' });
    expect(resolveShortcut({ key: 'h' }, ctx())).toEqual({ type: 'toggleHint' });
    expect(resolveShortcut({ key: 'Enter' }, ctx())).toEqual({ type: 'enter' });
    expect(resolveShortcut({ key: 'Escape' }, ctx())).toEqual({ type: 'pause' });
  });

  it('ignores option keys beyond the number of options and H without a hint', () => {
    expect(resolveShortcut({ key: '4' }, ctx({ optionCount: 3 }))).toBeNull();
    expect(resolveShortcut({ key: 'h' }, ctx({ hasHint: false }))).toBeNull();
  });

  it('input guard: inside a text field only Enter and Esc act', () => {
    const typing = ctx({ inTextField: true });
    for (const key of ['1', '2', '0', 'h', 'H', '?']) {
      expect(resolveShortcut({ key }, typing), key).toBeNull();
    }
    expect(resolveShortcut({ key: 'Enter' }, typing)).toEqual({ type: 'enter' });
    expect(resolveShortcut({ key: 'Escape' }, typing)).toEqual({ type: 'pause' });
  });

  it('lets a focused button handle its own Enter', () => {
    expect(resolveShortcut({ key: 'Enter' }, ctx({ onActivatable: true }))).toBeNull();
  });

  it('? toggles the why only after answering; choice keys do nothing then', () => {
    expect(resolveShortcut({ key: '?' }, ctx({ phase: 'feedback' }))).toEqual({
      type: 'toggleWhy',
    });
    expect(resolveShortcut({ key: '1' }, ctx({ phase: 'feedback' }))).toBeNull();
    expect(resolveShortcut({ key: 'Enter' }, ctx({ phase: 'submitting' }))).toBeNull();
  });

  it('never fires with modifier keys (browser shortcuts stay intact)', () => {
    expect(resolveShortcut({ key: '1', metaKey: true }, ctx())).toBeNull();
    expect(resolveShortcut({ key: 'h', ctrlKey: true }, ctx())).toBeNull();
  });
});

describe('focusKind', () => {
  it('classifies inputs, buttons and option rows', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    const option = document.createElement('button');
    option.dataset.playerOption = '';
    expect(focusKind(input)).toEqual({ inTextField: true, onActivatable: false });
    expect(focusKind(button)).toEqual({ inTextField: false, onActivatable: true });
    expect(focusKind(option)).toEqual({ inTextField: false, onActivatable: false });
    expect(focusKind(null)).toEqual({ inTextField: false, onActivatable: false });
  });
});
