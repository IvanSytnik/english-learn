import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticQuestionView } from '@/lib/diagnostic';
import en from '../../messages/en.json';

const { startDiagnosticAction, submitDiagnosticAnswerAction } = vi.hoisted(() => ({
  startDiagnosticAction: vi.fn(),
  submitDiagnosticAnswerAction: vi.fn(),
}));
vi.mock('@/app/[locale]/(student)/diagnostic/actions', () => ({
  startDiagnosticAction,
  submitDiagnosticAnswerAction,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { DiagnosticFlow } = await import('@/app/[locale]/(student)/diagnostic/diagnostic-flow');

const question = (position: number, id = `q${position}`): DiagnosticQuestionView => ({
  attemptId: 'att-1',
  position,
  total: 16,
  item: { id, stem: `Sentence ${position} ___ here.`, choices: ['am', 'is', 'are', 'be'] },
});
const asStep = (q: DiagnosticQuestionView) => ({ kind: 'question' as const, question: q });
const reply = (step: unknown, stale = false) => ({ ok: true, value: { stale, step } });

function renderFlow(initial: Parameters<typeof DiagnosticFlow>[0]['initial']) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DiagnosticFlow initial={initial} />
    </NextIntlClientProvider>,
  );
}

const key = (k: string) => fireEvent.keyDown(window, { key: k });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DiagnosticFlow', () => {
  it('intro: Start fetches the first question', async () => {
    startDiagnosticAction.mockResolvedValue({ ok: true, value: asStep(question(0)) });
    renderFlow({ kind: 'intro' });
    expect(screen.getByRole('heading', { name: 'Diagnostic test' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Question 1 of 16')).toBeTruthy();
    expect(startDiagnosticAction).toHaveBeenCalledTimes(1);
  });

  it('a question: stem in English, options as native radios, focus on the stem', () => {
    renderFlow(asStep(question(4)));
    const stem = document.getElementById('diagnostic-stem');
    expect(stem?.getAttribute('lang')).toBe('en');
    expect(document.activeElement).toBe(stem);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('status').textContent).toBe('Question 5 of 16');
  });

  it('digits select even with focus on a radio', () => {
    renderFlow(asStep(question(0)));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    radios[0]?.focus();
    fireEvent.keyDown(radios[0] as HTMLElement, { key: '3' });
    expect(radios[2]?.checked).toBe(true);
  });

  it('1–4 select, Enter answers, and the next question follows with no verdict', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply(asStep(question(1))));
    renderFlow(asStep(question(0)));
    key('2');
    expect((screen.getAllByRole('radio')[1] as HTMLInputElement).checked).toBe(true);
    key('Enter');
    expect(await screen.findByText('Question 2 of 16')).toBeTruthy();
    expect(submitDiagnosticAnswerAction).toHaveBeenCalledWith({
      attemptId: 'att-1',
      position: 0,
      itemId: 'q0',
      choiceIndex: 1,
    });
    expect(document.body.textContent).not.toMatch(/correct|right|wrong|incorrect/i);
    expect(document.activeElement).toBe(document.getElementById('diagnostic-stem'));
  });

  it('Enter on a just-clicked option answers it', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply(asStep(question(1))));
    renderFlow(asStep(question(0)));
    const option = screen.getAllByRole('radio')[2] as HTMLElement;
    fireEvent.click(option);
    option.focus();
    fireEvent.keyDown(option, { key: 'Enter' });
    await screen.findByText('Question 2 of 16');
    expect(submitDiagnosticAnswerAction).toHaveBeenCalledWith(
      expect.objectContaining({ choiceIndex: 2 }),
    );
  });

  it('0 is "I don\'t know", sent at once', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply(asStep(question(1))));
    renderFlow(asStep(question(0)));
    key('0');
    await screen.findByText('Question 2 of 16');
    expect(submitDiagnosticAnswerAction).toHaveBeenCalledWith(
      expect.objectContaining({ dontKnow: true, position: 0 }),
    );
  });

  it('a second Enter while the answer is on its way sends nothing more', async () => {
    let resolve: (v: unknown) => void = () => {};
    submitDiagnosticAnswerAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderFlow(asStep(question(0)));
    key('1');
    key('Enter');
    key('Enter');
    key('0');
    fireEvent.click(screen.getByRole('button', { name: /I don't know/ }));
    expect(submitDiagnosticAnswerAction).toHaveBeenCalledTimes(1);
    await act(async () => resolve(reply(asStep(question(1)))));
    expect(await screen.findByText('Question 2 of 16')).toBeTruthy();
  });

  it('stale: silently shows the step the server says is current', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply(asStep(question(7, 'other')), true));
    renderFlow(asStep(question(3)));
    key('1');
    key('Enter');
    expect(await screen.findByText('Question 8 of 16')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the last answer leads to Done with a link to practice', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(
      reply({ kind: 'completed', attemptId: 'att-1' }),
    );
    renderFlow(asStep(question(15)));
    key('1');
    key('Enter');
    const heading = await screen.findByRole('heading', { name: 'Done!' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole('link', { name: 'Go to practice' }).getAttribute('href')).toBe(
      '/exercises',
    );
  });

  it('a broken bank shows "unavailable" with practice, not a crash', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue({ ok: false, error: 'BANK_EXHAUSTED' });
    renderFlow(asStep(question(2)));
    key('0');
    expect(
      await screen.findByRole('heading', { name: 'The diagnostic test is unavailable' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to practice' })).toBeTruthy();
  });

  it('a failed send keeps the question and lets the learner retry', async () => {
    submitDiagnosticAnswerAction
      .mockResolvedValueOnce({ ok: false, error: 'ITEM_NOT_FOUND' })
      .mockResolvedValueOnce(reply(asStep(question(1))));
    renderFlow(asStep(question(0)));
    key('1');
    key('Enter');
    expect(await screen.findByRole('alert')).toBeTruthy();
    // The send is over once the controls are live again.
    const answerButton = screen.getByRole('button', { name: /^Answer/ }) as HTMLButtonElement;
    await waitFor(() => expect(answerButton.disabled).toBe(false));
    key('Enter');
    expect(await screen.findByText('Question 2 of 16')).toBeTruthy();
  });
});
