import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageLabel } from './stage-label';

const filled = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-filled]')].map((d) => d.getAttribute('data-filled'));

describe('StageLabel', () => {
  it('renders the stage word as text, dots hidden from assistive tech', () => {
    const { container } = render(<StageLabel stage="SOLID" label="Solid" />);
    expect(screen.getByText('Solid')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).toBe('Solid');
  });

  it('fills dots up to the current stage, in that stage colour', () => {
    const { container } = render(<StageLabel stage="DEVELOPING" label="Developing" />);
    expect(filled(container)).toEqual(['true', 'true', 'true', 'false', 'false']);
    const dots = container.querySelectorAll('[data-filled="true"]');
    for (const d of dots) expect(d.className).toContain('bg-mastery-3');
  });

  it('Not started fills only the first, neutral dot; Secure fills all five', () => {
    const a = render(<StageLabel stage="NOT_STARTED" label="Not started" />);
    expect(filled(a.container)).toEqual(['true', 'false', 'false', 'false', 'false']);
    const b = render(<StageLabel stage="SECURE" label="Secure" />);
    expect(filled(b.container)).toEqual(['true', 'true', 'true', 'true', 'true']);
  });

  it('shows the Due for review badge only when fading, without changing the stage', () => {
    const { container, rerender } = render(
      <StageLabel stage="SOLID" label="Solid" fading fadingLabel="Due for review" />,
    );
    expect(screen.getByText('Due for review')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'SOLID');
    rerender(
      <StageLabel stage="SOLID" label="Solid" fading={false} fadingLabel="Due for review" />,
    );
    expect(screen.queryByText('Due for review')).toBeNull();
  });
});
