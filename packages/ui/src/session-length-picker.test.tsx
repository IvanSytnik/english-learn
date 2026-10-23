import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionLengthPicker } from './session-length-picker';

const options = [
  { minutes: 5, label: '5 min', detail: '6 questions' },
  { minutes: 10, label: '10 min', detail: '12 questions' },
  { minutes: 20, label: '20 min', detail: '24 questions' },
];

function renderPicker() {
  return render(
    <SessionLengthPicker
      legend="How long do you have?"
      options={options}
      defaultMinutes={10}
      startLabel="Start"
    />,
  );
}

describe('SessionLengthPicker', () => {
  it('is a named radio group with the default preselected', () => {
    renderPicker();
    const group = screen.getByRole('group', { name: 'How long do you have?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['5', '10', '20']);
    expect(screen.getByRole('radio', { name: '10 min' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '5 min' })).not.toBeChecked();
  });

  it('names each option by length and size, not by colour', () => {
    renderPicker();
    const radio = screen.getByRole('radio', { name: '20 min' });
    expect(radio).toHaveAccessibleDescription('24 questions');
  });

  it('submits ?minutes= with a GET form and a real submit button', () => {
    const { container } = renderPicker();
    const form = container.querySelector('form');
    expect(form).toHaveAttribute('method', 'get');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('name', 'minutes');
    }
    expect(screen.getByRole('button', { name: /Start/ })).toHaveAttribute('type', 'submit');
  });
});
