import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';
import { cn } from './utils';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    // Compare against the variant itself: a raw class literal here would make Tailwind generate it.
    expect(btn.className).toBe(cn(buttonVariants({ variant: 'danger' })));
    expect(btn.className).not.toBe(cn(buttonVariants({ variant: 'primary' })));
  });

  it('flag variant uses the flag fill and its on-flag text', () => {
    render(<Button variant="flag">Start</Button>);
    expect(screen.getByRole('button').className).toBe(cn(buttonVariants({ variant: 'flag' })));
    expect(buttonVariants({ variant: 'flag' })).toMatch(/(^| )bg-flag( |$)/);
    expect(buttonVariants({ variant: 'flag' })).toMatch(/(^| )text-on-flag( |$)/);
  });

  it('respects disabled state', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
