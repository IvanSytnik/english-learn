import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekRhythm } from './week-rhythm';

const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const days = labels.map((label, i) => ({
  key: `2026-10-${19 + i}`,
  label,
  counted: i === 0 || i === 2,
  isToday: i === 2,
}));

function renderRhythm() {
  return render(
    <WeekRhythm
      title="This week"
      summary="2 of 3 sessions"
      note="A day counts after 5 answers."
      days={days}
      dayLabels={{ counted: 'session done', open: 'no session', today: 'today' }}
    />,
  );
}

describe('WeekRhythm', () => {
  it('is a named region with the tally as text', () => {
    renderRhythm();
    const region = screen.getByRole('region', { name: 'This week' });
    expect(within(region).getByText('2 of 3 sessions')).toBeInTheDocument();
    expect(within(region).getByText('A day counts after 5 answers.')).toBeInTheDocument();
  });

  it('speaks each day as words, never relying on colour', () => {
    renderRhythm();
    const items = screen.getAllByRole('listitem');
    const spoken = [
      'Mon, session done',
      'Tue, no session',
      'Wed, today, session done',
      'Thu, no session',
      'Fri, no session',
      'Sat, no session',
      'Sun, no session',
    ];
    expect(items).toHaveLength(7);
    items.forEach((li, i) => {
      expect(li).toHaveTextContent(spoken[i] as string);
    });
    expect(items[2]).toHaveAttribute('aria-current', 'date');
    // A counted day also differs by shape: it carries a check mark.
    expect(items[0]?.querySelector('svg')).not.toBeNull();
    expect(items[1]?.querySelector('svg')).toBeNull();
  });
});
