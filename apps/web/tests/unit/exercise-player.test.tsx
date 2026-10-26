import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseFeedback, ExerciseView } from '@/lib/exercise/view';
import en from '../../messages/en.json';

const { submitExerciseAttempt, nextExercise, weekRhythm, push } = vi.hoisted(() => ({
  submitExerciseAttempt: vi.fn(),
  nextExercise: vi.fn(),
  weekRhythm: vi.fn(),
  push: vi.fn(),
}));
vi.mock('@/app/[locale]/(student)/exercises/actions', () => ({
  submitExerciseAttempt,
  nextExercise,
  weekRhythm,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push }),
}));

const { ExercisePlayer } = await import('@/app/[locale]/(student)/exercises/exercise-player');

const choiceView: ExerciseView = {
  itemId: 'item.a',
  conceptTitle: 'Past Simple',
  reason: 'REVIEW_DUE',
  isNewConcept: false,
  detail: { kind: 'lastPractised', days: 6 },
  question: {
    type: 'choice',
    prompt: 'Last summer we ___ to Spain.',
    options: ['goed', 'gone', 'go', 'went'],
  },
  hint: 'go → went',
};
const clozeView: ExerciseView = {
  ...choiceView,
  itemId: 'item.b',
  question: { type: 'cloze', prompt: 'There are three ___ on the shelf. (box)' },
};
const feedback: ExerciseFeedback = {
  verdict: 'correct',
  chosenIndex: 3,
  correctIndex: 3,
  correctAnswer: 'went',
  answerSentence: 'Last summer we went to Spain.',
  why: 'Irregular past.',
  more: null,
  consequence: { kind: 'stageCrossed', concept: 'Past Simple', stage: 'SOLID' },
  review: { kind: 'backInDays', days: 3 },
};

const week = {
  days: ['19', '20', '21', '22', '23', '24', '25'].map((d, i) => ({
    date: `2026-10-${d}`,
    attempts: i === 0 || i === 2 ? 6 : 0,
    counted: i === 0 || i === 2,
    isToday: i === 2,
    isFuture: i > 2,
  })),
  sessions: 2,
  goal: 3,
  timeZone: 'Europe/Vienna',
};

function renderPlayer(initial: ExerciseView, sessionLength = 12) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExercisePlayer initial={initial} sessionLength={sessionLength} />
    </NextIntlClientProvider>,
  );
}
const key = (k: string, target: Element | Window = window) =>
  act(() => {
    fireEvent.keyDown(target, { key: k });
  });

/*
 * After an async step the new phase is in the DOM before the player's effects
 * run — and the keyboard listener is (re)attached by one of those effects. A
 * key pressed in that gap reaches the previous phase's listener and is lost
 * (a slow CI runner widens the gap). The same commit moves focus, so wait for
 * the focus: once it is there, the listener is current.
 */
const onFeedback = async (verdict: string) => {
  await screen.findByText(verdict);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toHaveFocus());
};
const onClozeQuestion = async () => {
  const field = await screen.findByRole('textbox', { name: 'Your answer' });
  await waitFor(() => expect(field).toHaveFocus());
  return field;
};

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
  // Reset implementations too: a test that fails midway must not leave its
  // unconsumed *Once replies to the next one.
  submitExerciseAttempt.mockReset();
  nextExercise.mockReset();
  submitExerciseAttempt.mockResolvedValue({ ok: true, value: feedback });
  weekRhythm.mockResolvedValue({ ok: true, value: week });
});

describe('ExercisePlayer', () => {
  it('renders the top bar: progress, reason chip with detail, concept and pause', () => {
    renderPlayer(choiceView);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Last practised 6 days ago')).toBeInTheDocument();
    expect(screen.getByText('Past Simple')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pause/ })).toHaveAttribute('href', '/dashboard');
    expect(document.getElementById('exercise-prompt')).toHaveAttribute('lang', 'en');
  });

  it('selects with 1–4 and checks with Enter, then shows inline feedback', async () => {
    renderPlayer(choiceView);
    key('4');
    expect(screen.getByRole('button', { name: /went/ })).toHaveAttribute('aria-pressed', 'true');
    key('Enter');
    await waitFor(() =>
      expect(submitExerciseAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item.a', answer: { type: 'choice', index: 3 } }),
      ),
    );
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Past Simple is now Solid')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    // The prompt stays on screen above the feedback.
    expect(document.getElementById('exercise-prompt')).toBeInTheDocument();
  });

  it("0 submits I don't know", async () => {
    renderPlayer(choiceView);
    key('0');
    await waitFor(() =>
      expect(submitExerciseAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ answer: { type: 'dontKnow' } }),
      ),
    );
  });

  it('H toggles the hint', () => {
    renderPlayer(choiceView);
    key('h');
    expect(screen.getByText('go → went')).toBeInTheDocument();
    key('h');
    expect(screen.queryByText('go → went')).toBeNull();
  });

  it('input guard: typing 1, 0, h, ? in the cloze field types instead of triggering shortcuts', async () => {
    renderPlayer(clozeView);
    const input = screen.getByRole('textbox', { name: 'Your answer' });
    for (const k of ['1', '0', 'h', '?']) key(k, input);
    expect(submitExerciseAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText('go → went')).toBeNull();

    fireEvent.change(input, { target: { value: 'boxes' } });
    key('Enter', input);
    await waitFor(() =>
      expect(submitExerciseAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ answer: { type: 'text', value: 'boxes' } }),
      ),
    );
  });

  it('Enter on feedback loads the next item, skipping the one just shown', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: clozeView });
    renderPlayer(choiceView);
    key('2');
    key('Enter');
    await onFeedback('Correct');
    key('Enter');
    await waitFor(() => expect(nextExercise).toHaveBeenCalledWith(['item.a']));
    expect(await onClozeQuestion()).toBeInTheDocument();
  });

  it('a key pressed the instant feedback shows already acts on the feedback', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: clozeView });
    renderPlayer(choiceView);
    key('4');
    const pressed = pressWhenShown('Enter', () => screen.queryByText('Correct') !== null);
    key('Enter');
    await pressed;
    // Enter on feedback = continue: the next item is requested.
    await waitFor(() => expect(nextExercise).toHaveBeenCalledTimes(1));
  });

  // Two presses in one tick, raw (no act): no re-render in between, so only a
  // guard that does not wait for state can stop the second one.
  const doubleEnter = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  };

  it('two Enters in the same tick send one answer', async () => {
    renderPlayer(choiceView);
    key('4');
    doubleEnter();
    await onFeedback('Correct');
    expect(submitExerciseAttempt).toHaveBeenCalledTimes(1);
  });

  it('two Enters in the same tick on feedback load one next item', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: clozeView });
    renderPlayer(choiceView);
    key('4');
    key('Enter');
    await onFeedback('Correct');
    doubleEnter();
    await onClozeQuestion();
    expect(nextExercise).toHaveBeenCalledTimes(1);
  });

  it('a double Enter sends one answer', async () => {
    renderPlayer(choiceView);
    key('4');
    key('Enter');
    key('Enter');
    await screen.findByText('Correct');
    expect(submitExerciseAttempt).toHaveBeenCalledTimes(1);
  });

  it('Esc pauses back to the dashboard', () => {
    renderPlayer(choiceView);
    key('Escape');
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('ends with a summary built from the session feedback, without the answers', async () => {
    submitExerciseAttempt
      .mockResolvedValueOnce({ ok: true, value: feedback })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ...feedback,
          verdict: 'dontKnow',
          chosenIndex: null,
          correctAnswer: 'boxes',
          answerSentence: 'There are three boxes on the shelf.',
          consequence: { kind: 'backSoon' },
          review: { kind: 'backSoon' },
        },
      });
    nextExercise.mockResolvedValue({
      ok: true,
      value: { ...clozeView, conceptTitle: 'Plural nouns' },
    });
    renderPlayer(choiceView, 2);

    key('4');
    key('Enter');
    await onFeedback('Correct');
    key('Enter');
    await onClozeQuestion();
    key('0');
    await onFeedback("Here's the answer");
    key('Enter');

    const heading = await screen.findByRole('heading', { name: 'Session complete' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('You answered 2 questions.')).toBeInTheDocument();
    const tally = (k: string) => document.querySelector(`[data-tally="${k}"] dd`)?.textContent;
    expect([tally('correct'), tally('incorrect'), tally('dontKnow')]).toEqual(['1', '0', '1']);
    // The crossing and the review of the same answer both survive.
    const moved = screen.getByRole('region', { name: 'Moved up' });
    expect(moved).toHaveTextContent('Past Simple');
    expect(moved).toHaveTextContent('Solid');
    const review = screen.getByRole('region', { name: 'Coming back for review' });
    const row = (kind: string) => review.querySelector(`[data-review="${kind}"]`) as HTMLElement;
    expect(row('backSoon')).toHaveTextContent('Back soon');
    expect(
      within(row('backSoon'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Plural nouns']);
    expect(row('backInDays')).toHaveTextContent('Back in 3 days');
    expect(
      within(row('backInDays'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Past Simple']);
    // Progress, not a replay of the answers.
    expect(document.body).not.toHaveTextContent(/went|boxes/);

    // This week's rhythm, asked for in the browser's own time zone.
    const rhythm = await screen.findByRole('region', { name: 'This week' });
    expect(weekRhythm).toHaveBeenCalledWith(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(rhythm).toHaveTextContent('2 of 3 sessions');
    expect(rhythm).toHaveTextContent('Wed, today, session done');
    expect(rhythm).toHaveTextContent('A day counts once you answer 5 questions.');
  });

  it('Another session starts over from zero', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: clozeView });
    renderPlayer(choiceView, 1);
    key('4');
    key('Enter');
    await onFeedback('Correct');
    key('Enter');
    fireEvent.click(await screen.findByRole('button', { name: 'Another session' }));
    expect(await screen.findByRole('textbox', { name: 'Your answer' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  });

  it('keeps the learner on the question when submitting fails', async () => {
    submitExerciseAttempt.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    renderPlayer(choiceView);
    key('1');
    key('Enter');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: /goed/ })).not.toBeDisabled();
  });
});

describe('ExercisePlayer — the hint is recorded (§8 #11)', () => {
  const secondView: ExerciseView = { ...choiceView, itemId: 'item.c' };
  const sent = (n: number) => submitExerciseAttempt.mock.calls[n]?.[0]?.hinted;
  const onChoiceQuestion = async () => {
    const prompt = document.getElementById('exercise-prompt');
    await waitFor(() => expect(prompt).toHaveFocus());
    await waitFor(() => expect(screen.queryByText('Correct')).toBeNull());
  };
  const answer = async () => {
    key('4');
    key('Enter');
    await onFeedback('Correct');
  };

  it('no hint opened → hinted: false', async () => {
    renderPlayer(choiceView);
    await answer();
    expect(sent(0)).toBe(false);
  });

  it('opened with H and closed again before answering → hinted: true', async () => {
    renderPlayer(choiceView);
    key('h');
    key('h');
    expect(screen.queryByText('go → went')).toBeNull();
    await answer();
    expect(sent(0)).toBe(true);
  });

  it('opened by a click → hinted: true', async () => {
    renderPlayer(choiceView);
    fireEvent.click(screen.getByRole('button', { name: /^Hint/ }));
    expect(screen.getByText('go → went')).toBeInTheDocument();
    await answer();
    expect(sent(0)).toBe(true);
  });

  it('H pressed in the same tick as the answer still counts', async () => {
    renderPlayer(choiceView);
    key('4');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await onFeedback('Correct');
    expect(sent(0)).toBe(true);
  });

  it('H on feedback opens nothing and does not leak into the next question', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: secondView });
    renderPlayer(choiceView);
    await answer();
    key('h');
    expect(screen.queryByText('go → went')).toBeNull();
    key('Enter');
    await onChoiceQuestion();
    await answer();
    expect([sent(0), sent(1)]).toEqual([false, false]);
  });

  it('resets with the next question', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: secondView });
    renderPlayer(choiceView);
    key('h');
    await answer();
    key('Enter');
    await onChoiceQuestion();
    expect(screen.queryByText('go → went')).toBeNull();
    await answer();
    expect([sent(0), sent(1)]).toEqual([true, false]);
  });

  it('resets in Another session', async () => {
    nextExercise.mockResolvedValue({ ok: true, value: secondView });
    renderPlayer(choiceView, 1);
    key('h');
    await answer();
    key('Enter');
    fireEvent.click(await screen.findByRole('button', { name: 'Another session' }));
    await onChoiceQuestion();
    await answer();
    expect([sent(0), sent(1)]).toEqual([true, false]);
  });

  it('survives a failed submit: the retry of the same question still carries it', async () => {
    submitExerciseAttempt.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });
    renderPlayer(choiceView);
    key('h');
    key('4');
    key('Enter');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await answer();
    expect([sent(0), sent(1)]).toEqual([true, true]);
  });

  it('a question without a hint: no button, H does nothing, hinted: false', async () => {
    renderPlayer({ ...choiceView, hint: null });
    expect(screen.queryByRole('button', { name: /^Hint/ })).toBeNull();
    key('h');
    await answer();
    expect(sent(0)).toBe(false);
  });
});
