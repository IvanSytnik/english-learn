import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReasonChip, reasonChipKind } from './reason-chip';

const labels = { review: 'Review', new: 'New', checkIn: 'Check-in' };

describe('reasonChipKind', () => {
  it('maps the selection to the chip (HANDOFF §7)', () => {
    expect(reasonChipKind('REVIEW_DUE', false)).toBe('review');
    expect(reasonChipKind('REVIEW_DUE', true)).toBe('review');
    expect(reasonChipKind('NEW_INTRODUCTION', true)).toBe('new');
    expect(reasonChipKind('NEW_INTRODUCTION', false)).toBe('checkIn');
    expect(reasonChipKind('EXPLORATION_FLOOR', false)).toBe('checkIn');
  });
});

describe('ReasonChip', () => {
  it('renders the localized chip word and the detail line', () => {
    render(
      <ReasonChip
        reason="NEW_INTRODUCTION"
        isNewConcept
        labels={labels}
        detail="Unlocked by Past Simple"
      />,
    );
    expect(screen.getByText('New')).toHaveAttribute('data-kind', 'new');
    expect(screen.getByText('Unlocked by Past Simple')).toBeInTheDocument();
  });

  it('omits the detail line when none is given', () => {
    const { container } = render(
      <ReasonChip reason="REVIEW_DUE" isNewConcept={false} labels={labels} />,
    );
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  it('wraps instead of forcing a fixed width', () => {
    const { container } = render(
      <ReasonChip reason="REVIEW_DUE" isNewConcept={false} labels={labels} detail="x" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex-wrap');
    expect(root.className).not.toMatch(/\bw-\d/);
  });
});
