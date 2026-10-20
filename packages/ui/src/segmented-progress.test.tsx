import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentedProgress } from './segmented-progress';

const states = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-state]')].map((s) => s.getAttribute('data-state'));

describe('SegmentedProgress', () => {
  it('exposes one progressbar with min/max/now', () => {
    render(
      <SegmentedProgress total={12} completed={3} label="Session progress" valueText="3 of 12" />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Session progress' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '12');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 12');
  });

  it('renders done, current and upcoming segments', () => {
    render(<SegmentedProgress total={5} completed={2} label="p" />);
    expect(states(screen.getByRole('progressbar'))).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });

  it('has no current segment once complete, and clamps out-of-range input', () => {
    render(<SegmentedProgress total={3} completed={7} label="p" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(states(bar)).toEqual(['done', 'done', 'done']);
  });

  it('treats negative progress as zero', () => {
    render(<SegmentedProgress total={2} completed={-1} label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
