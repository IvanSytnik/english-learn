import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kbd, KeyHint } from './key-hint';

describe('KeyHint', () => {
  it('renders a monospace kbd with tabular numerals', () => {
    render(<KeyHint>Enter</KeyHint>);
    const kbd = screen.getByText('Enter');
    expect(kbd.tagName).toBe('KBD');
    expect(kbd.className).toContain('font-mono');
    expect(kbd.className).toContain('tabular-nums');
  });

  it('hides itself on devices that cannot hover (touch)', () => {
    render(<KeyHint>1</KeyHint>);
    expect(screen.getByText('1').className).toContain('[@media(hover:none)]:hidden');
  });

  it('is exported as Kbd too', () => {
    expect(Kbd).toBe(KeyHint);
  });
});
