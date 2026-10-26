import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticQuestionView } from '@/lib/diagnostic';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

const { saveNativeLanguageAction, startDiagnosticAction, submitDiagnosticAnswerAction } =
  vi.hoisted(() => ({
    saveNativeLanguageAction: vi.fn(),
    startDiagnosticAction: vi.fn(),
    submitDiagnosticAnswerAction: vi.fn(),
  }));
vi.mock('@/app/[locale]/(student)/diagnostic/actions', () => ({
  saveNativeLanguageAction,
  startDiagnosticAction,
  submitDiagnosticAnswerAction,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch ?? true)} {...rest}>
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

function renderFlow(
  initial: Parameters<typeof DiagnosticFlow>[0]['initial'],
  { locale = 'en', messages = en }: { locale?: string; messages?: typeof en } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DiagnosticFlow initial={initial} />
    </NextIntlClientProvider>,
  );
}

const key = (k: string) => fireEvent.keyDown(window, { key: k });

/**
 * Press `k` the instant `shown()` turns true — from a MutationObserver
 * callback, i.e. right after React commits that DOM and before it runs the
 * commit's effects. A raw dispatch, no act(): nothing may flush effects first.
 */
function pressWhenShown(k: string, shown: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!shown()) return;
      observer.disconnect();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      resolve();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // A test that fails midway must not leave its *Once replies to the next one.
  saveNativeLanguageAction.mockReset();
  startDiagnosticAction.mockReset();
  submitDiagnosticAnswerAction.mockReset();
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

  it('a key pressed the instant the next question shows answers that question', async () => {
    submitDiagnosticAnswerAction
      .mockResolvedValueOnce(reply(asStep(question(1))))
      .mockResolvedValueOnce(reply(asStep(question(2))));
    renderFlow(asStep(question(0)));
    const pressed = pressWhenShown('0', () => screen.queryByText('Question 2 of 16') !== null);
    key('1');
    key('Enter');
    await pressed;
    await waitFor(() => expect(submitDiagnosticAnswerAction).toHaveBeenCalledTimes(2));
    expect(submitDiagnosticAnswerAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 1, itemId: 'q1', dontKnow: true }),
    );
  });

  it('stale: silently shows the step the server says is current', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply(asStep(question(7, 'other')), true));
    renderFlow(asStep(question(3)));
    key('1');
    key('Enter');
    expect(await screen.findByText('Question 8 of 16')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  const result = {
    level: 'B1' as const,
    axes: [
      { axis: 'GRAMMAR' as const, level: 'A2' as const },
      { axis: 'VOCAB' as const, level: 'B2' as const },
    ],
    startConcept: { title: 'Past Simple' },
  };

  it('the last answer leads to the result: level, axes, a suggested topic, practice', async () => {
    submitDiagnosticAnswerAction.mockResolvedValue(reply({ kind: 'completed', result }));
    renderFlow(asStep(question(15)));
    key('1');
    key('Enter');
    const heading = await screen.findByRole('heading', { name: 'Done!' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole('heading', { name: 'Your level' })).toBeTruthy();
    expect(screen.getByText('B1')).toBeTruthy();
    expect(screen.getByText('Grammar A2 · Vocabulary B2')).toBeTruthy();
    expect(screen.getByText('We suggest starting with “Past Simple”.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to practice' }).getAttribute('href')).toBe(
      '/exercises',
    );
    // The review is a page of its own, fetched only when asked for.
    const review = screen.getByRole('link', { name: 'See your answers' });
    expect(review.getAttribute('href')).toBe('/diagnostic/review');
    expect(review.getAttribute('data-prefetch')).toBe('false');
  });

  it('a result without a suggested topic shows the level only', () => {
    renderFlow({ kind: 'completed', result: { ...result, startConcept: null } });
    expect(screen.getByText('B1')).toBeTruthy();
    expect(screen.queryByText(/We suggest/)).toBeNull();
  });

  it('a result without a level: no level, no topic, still a way to practice', () => {
    renderFlow({ kind: 'completed', result: { level: null, axes: [], startConcept: null } });
    expect(screen.getByRole('heading', { name: 'Done!' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your level' })).toBeNull();
    expect(screen.getByText(/can’t show the result right now/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to practice' }).getAttribute('href')).toBe(
      '/exercises',
    );
    // Answers are stored, so the review is there even without a level.
    expect(screen.getByRole('link', { name: 'See your answers' }).getAttribute('href')).toBe(
      '/diagnostic/review',
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
    // The send is over once the controls are live again; then let the effects
    // that re-attach the key listener run (nothing visible marks that moment).
    const answerButton = screen.getByRole('button', { name: /^Answer/ }) as HTMLButtonElement;
    await waitFor(() => expect(answerButton.disabled).toBe(false));
    await act(async () => {});
    key('Enter');
    expect(await screen.findByText('Question 2 of 16')).toBeTruthy();
  });
});

describe('DiagnosticFlow: the native language step', () => {
  const radios = () => screen.getAllByRole('radio') as HTMLInputElement[];
  const continueButton = () =>
    screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;

  it('four fixed choices, endonyms tagged with their language, nothing preselected', () => {
    renderFlow({ kind: 'language' });
    expect(screen.getByRole('heading', { name: 'Your native language' })).toBeTruthy();
    expect(radios().map((r) => r.value)).toEqual(['ru', 'uk', 'de', 'other']);
    // Each radio is named by its label alone (no secondary text glued on).
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Українська' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Other language' })).toBeTruthy();
    expect(screen.getByText('Русский').getAttribute('lang')).toBe('ru');
    expect(screen.getByText('Українська').getAttribute('lang')).toBe('uk');
    expect(screen.getByText('Deutsch').getAttribute('lang')).toBe('de');
    expect(screen.getByText('Other language').hasAttribute('lang')).toBe(false);
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(continueButton().disabled).toBe(true);
  });

  it('never preselects from the interface language', () => {
    renderFlow({ kind: 'language' }, { locale: 'ru', messages: ru });
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(screen.getByRole('radio', { name: 'Другой язык' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Продолжить' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('a choice is sent only on Continue, then the intro takes focus', async () => {
    saveNativeLanguageAction.mockResolvedValue({ ok: true, value: { kind: 'intro' } });
    renderFlow({ kind: 'language' });
    fireEvent.click(screen.getByRole('radio', { name: 'Українська' }));
    expect(saveNativeLanguageAction).not.toHaveBeenCalled();
    expect(continueButton().disabled).toBe(false);
    fireEvent.click(continueButton());
    const heading = await screen.findByRole('heading', { name: 'Diagnostic test' });
    expect(saveNativeLanguageAction).toHaveBeenCalledTimes(1);
    expect(saveNativeLanguageAction).toHaveBeenCalledWith({ language: 'uk' });
    // Focus moves in an effect after the commit that shows the heading.
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('a second submit while saving sends nothing more', async () => {
    let resolve: (v: unknown) => void = () => {};
    saveNativeLanguageAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderFlow({ kind: 'language' });
    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    const form = continueButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(saveNativeLanguageAction).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, value: { kind: 'intro' } }));
    expect(await screen.findByRole('heading', { name: 'Diagnostic test' })).toBeTruthy();
  });

  it('a failed save keeps the choice and lets the learner retry', async () => {
    saveNativeLanguageAction
      .mockResolvedValueOnce({ ok: false, error: 'INVALID' })
      .mockResolvedValueOnce({ ok: true, value: { kind: 'intro' } });
    renderFlow({ kind: 'language' });
    fireEvent.click(screen.getByRole('radio', { name: 'Русский' }));
    fireEvent.click(continueButton());
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Your choice wasn't saved. Try again.",
    );
    await waitFor(() => expect(continueButton().disabled).toBe(false));
    expect((screen.getByRole('radio', { name: 'Русский' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(continueButton());
    expect(await screen.findByRole('heading', { name: 'Diagnostic test' })).toBeTruthy();
  });

  it('opened on the intro, the heading keeps its place in the page (no focus move)', () => {
    renderFlow({ kind: 'intro' });
    expect(document.activeElement).toBe(document.body);
  });

  it('Start answered NEEDS_LANGUAGE (no language yet) leads to the language step', async () => {
    startDiagnosticAction.mockResolvedValue({ ok: false, error: 'NEEDS_LANGUAGE' });
    renderFlow({ kind: 'intro' });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const heading = await screen.findByRole('heading', { name: 'Your native language' });
    // Focus moves in an effect after the commit that shows the heading.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(radios().some((r) => r.checked)).toBe(false);
  });
});
