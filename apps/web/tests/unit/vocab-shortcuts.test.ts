import { describe, expect, it } from 'vitest';
import {
  isEditableTarget,
  resolveIntroShortcut,
  resolveVocabShortcut,
  type VocabShortcutContext,
} from '@/lib/vocab-shortcuts';
import { ru, uk, us } from './keys';

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
    expect(resolveVocabShortcut(us('1'), ctx())).toEqual({ type: 'select', index: 0 });
    expect(resolveVocabShortcut(us('4'), ctx())).toEqual({ type: 'select', index: 3 });
    expect(resolveVocabShortcut(us('0'), ctx())).toEqual({ type: 'dontKnow' });
    expect(resolveVocabShortcut(us('k'), ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut(us('K'), ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut(us('h'), ctx())).toEqual({ type: 'toggleHint' });
    expect(resolveVocabShortcut(us('Enter'), ctx())).toEqual({ type: 'enter' });
    expect(resolveVocabShortcut(us('Escape'), ctx())).toEqual({ type: 'pause' });
  });

  it('in the answer field only Enter and Esc act', () => {
    const typing = ctx({ inTextField: true, optionCount: 0 });
    for (const key of ['k', 'K', 'h', 'H', '0', '1', '4', 'a']) {
      expect(resolveVocabShortcut(us(key), typing), key).toBeNull();
    }
    expect(resolveVocabShortcut(us('Enter'), typing)).toEqual({ type: 'enter' });
    expect(resolveVocabShortcut(us('Escape'), typing)).toEqual({ type: 'pause' });
  });

  it('K only on a word that can be proven, H only with a hint', () => {
    expect(resolveVocabShortcut(us('k'), ctx({ canProve: false }))).toBeNull();
    expect(resolveVocabShortcut(us('h'), ctx({ hasHint: false }))).toBeNull();
  });

  it('digits beyond the options, or in recall, choose nothing', () => {
    expect(resolveVocabShortcut(us('1'), ctx({ optionCount: 0 }))).toBeNull();
    expect(resolveVocabShortcut(us('5'), ctx())).toBeNull();
  });

  it('modifier chords are never ours', () => {
    for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      expect(resolveVocabShortcut({ ...us('2'), [mod]: true }, ctx()), mod).toBeNull();
      expect(resolveVocabShortcut({ ...us('Escape'), [mod]: true }, ctx()), mod).toBeNull();
    }
  });

  it('Enter on a focused button is the button’s own click', () => {
    expect(resolveVocabShortcut(us('Enter'), ctx({ onActivatable: true }))).toBeNull();
  });

  it('outside answering only Enter (feedback) and Esc act', () => {
    for (const phase of ['loading', 'submitting', 'feedback', 'done'] as const) {
      for (const key of ['1', '0', 'k', 'h']) {
        expect(resolveVocabShortcut(us(key), ctx({ phase })), `${phase} ${key}`).toBeNull();
      }
    }
    expect(resolveVocabShortcut(us('Enter'), ctx({ phase: 'feedback' }))).toEqual({
      type: 'enter',
    });
    expect(resolveVocabShortcut(us('Enter'), ctx({ phase: 'submitting' }))).toBeNull();
    expect(resolveVocabShortcut(us('Enter'), ctx({ phase: 'loading' }))).toBeNull();
  });

  it('works on any layout: matched by the physical key, not the character', () => {
    // Russian / Ukrainian ЙЦУКЕН: K types «л», H types «р».
    expect(resolveVocabShortcut(ru('KeyK'), ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut(uk('KeyK'), ctx())).toEqual({ type: 'know' });
    expect(resolveVocabShortcut(ru('KeyH'), ctx())).toEqual({ type: 'toggleHint' });
    expect(resolveVocabShortcut(uk('KeyH'), ctx())).toEqual({ type: 'toggleHint' });
    // AZERTY: the 1 key types «&», 0 types «à».
    expect(resolveVocabShortcut({ key: '&', code: 'Digit1' }, ctx())).toEqual({
      type: 'select',
      index: 0,
    });
    expect(resolveVocabShortcut({ key: 'à', code: 'Digit0' }, ctx())).toEqual({
      type: 'dontKnow',
    });
    // The numpad digits too.
    expect(resolveVocabShortcut({ key: '3', code: 'Numpad3' }, ctx())).toEqual({
      type: 'select',
      index: 2,
    });
  });

  it('a character alone is not a shortcut: «k» typed by another key does nothing', () => {
    // Dvorak types «k» with the physical V key: that is not the K shortcut.
    expect(resolveVocabShortcut({ key: 'k', code: 'KeyV' }, ctx())).toBeNull();
    expect(resolveVocabShortcut({ key: '1', code: '' }, ctx())).toBeNull();
  });

  it('the layout changes nothing about the input guard', () => {
    const typing = ctx({ inTextField: true, optionCount: 0 });
    expect(resolveVocabShortcut(ru('KeyK'), typing)).toBeNull();
    expect(resolveVocabShortcut(uk('KeyH'), typing)).toBeNull();
    expect(resolveVocabShortcut({ ...ru('KeyK'), ctrlKey: true }, ctx())).toBeNull();
  });
});

describe('resolveIntroShortcut (B6.5 intro card)', () => {
  const free = { inEditable: false, onActivatable: false };

  it('Enter and Space continue; K is "I know"; Esc pauses — on any layout', () => {
    expect(resolveIntroShortcut(us('Enter'), free)).toEqual({ type: 'continue' });
    expect(resolveIntroShortcut(us(' '), free)).toEqual({ type: 'continue' });
    expect(resolveIntroShortcut(us('k'), free)).toEqual({ type: 'know' });
    expect(resolveIntroShortcut(ru('KeyK'), free)).toEqual({ type: 'know' });
    expect(resolveIntroShortcut(uk('KeyK'), free)).toEqual({ type: 'know' });
    expect(resolveIntroShortcut(us('Escape'), free)).toEqual({ type: 'pause' });
    for (const key of ['1', '0', 'h', 'a'])
      expect(resolveIntroShortcut(us(key), free), key).toBeNull();
  });

  it.each([
    ['Meta', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
    ['an auto-repeat', { repeat: true }],
    ['an IME composition', { isComposing: true }],
  ])('K with %s: nothing', (_, over) => {
    expect(resolveIntroShortcut({ ...us('k'), ...over }, free)).toBeNull();
  });

  it('K with focus in an input, a textarea or a contenteditable: nothing', () => {
    expect(resolveIntroShortcut(us('k'), { inEditable: true, onActivatable: false })).toBeNull();
    expect(
      resolveIntroShortcut(us('Enter'), { inEditable: true, onActivatable: false }),
    ).toBeNull();
  });

  it('Enter / Space on a focused button are the button’s own click, not a second call', () => {
    const onButton = { inEditable: false, onActivatable: true };
    expect(resolveIntroShortcut(us('Enter'), onButton)).toBeNull();
    expect(resolveIntroShortcut(us(' '), onButton)).toBeNull();
    expect(resolveIntroShortcut(us('k'), onButton)).toEqual({ type: 'know' });
  });

  it('Enter / Space auto-repeat or mid-composition: nothing', () => {
    expect(resolveIntroShortcut({ ...us('Enter'), repeat: true }, free)).toBeNull();
    expect(resolveIntroShortcut({ ...us(' '), isComposing: true }, free)).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('any input, a textarea, a contenteditable (and inside it); not a button or a div', () => {
    const el = (html: string) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      return host.firstElementChild as Element;
    };
    expect(isEditableTarget(el('<input type="text">'))).toBe(true);
    expect(isEditableTarget(el('<input type="radio">'))).toBe(true);
    expect(isEditableTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isEditableTarget(el('<div contenteditable="true"></div>'))).toBe(true);
    expect(isEditableTarget(el('<div contenteditable=""><b>x</b></div>').firstElementChild)).toBe(
      true,
    );
    expect(isEditableTarget(el('<div contenteditable="false"></div>'))).toBe(false);
    expect(isEditableTarget(el('<button>Go</button>'))).toBe(false);
    expect(isEditableTarget(el('<div></div>'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
