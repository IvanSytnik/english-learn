import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const { auth, redirect, loadVocabOverview, vocabOverviewAction, updateDailyVocabLimitAction } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    redirect: vi.fn((_: { href: string; locale: string }) => {
      throw new Error('NEXT_REDIRECT');
    }),
    loadVocabOverview: vi.fn(),
    vocabOverviewAction: vi.fn(),
    updateDailyVocabLimitAction: vi.fn(),
  }));

type Href = string | { pathname: string; query?: Record<string, string> };
const hrefOf = (href: Href) =>
  typeof href === 'string'
    ? href
    : `${href.pathname}${href.query ? `?${new URLSearchParams(href.query)}` : ''}`;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/vocab-overview', () => ({ loadVocabOverview }));
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/app/_components/top-bar-controls', () => ({ TopBarControls: () => null }));
vi.mock('@/i18n/navigation', () => ({
  redirect,
  Link: ({ href, children, ...rest }: { href: Href; children: ReactNode }) => (
    <a href={hrefOf(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));
vi.mock('@/app/[locale]/(student)/actions/vocab', () => ({
  vocabOverviewAction,
  updateDailyVocabLimitAction,
}));

const { default: WordsPage } = await import('@/app/[locale]/(student)/words/page');

const w = en.student.words;
const stages = (over: Partial<Record<string, number>> = {}) => ({
  new: 0,
  learning: 0,
  familiar: 0,
  known: 0,
  mastered: 0,
  ...over,
});
const OVERVIEW = {
  dueNow: 3,
  newToday: 2,
  dailyLimit: 10,
  remainingNew: 8,
  totalWords: 7,
  startedWords: 3,
  stages: stages({ new: 4, learning: 2, known: 1 }),
  topics: [
    {
      topicId: 'travel',
      title: 'Travel',
      total: 7,
      started: 3,
      stages: stages({ new: 4, learning: 2, known: 1 }),
      levels: [
        {
          conceptId: 'vocab.travel.a1',
          level: 'A1',
          total: 5,
          started: 3,
          stages: stages({ new: 2, learning: 2, known: 1 }),
        },
        {
          conceptId: 'vocab.travel.a2',
          level: 'A2',
          total: 2,
          started: 0,
          stages: stages({ new: 2 }),
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
  loadVocabOverview.mockResolvedValue(OVERVIEW);
  // The browser-zone refresh after mounting: by default it brings the same counts.
  vocabOverviewAction.mockResolvedValue({ ok: true, value: OVERVIEW });
  updateDailyVocabLimitAction.mockResolvedValue({ ok: true, value: { dailyVocabLimit: 20 } });
});

async function renderPage() {
  const page = await WordsPage();
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      {page}
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(vocabOverviewAction).toHaveBeenCalled());
  return view;
}

const limitInput = () => screen.getByLabelText(w.limit.label);
const saveButton = () => screen.getByRole('button', { name: w.limit.save });

describe('/words page', () => {
  it('sends a signed-out visitor to /login', async () => {
    auth.mockResolvedValue(null);
    await expect(WordsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/login', locale: 'en' });
    expect(loadVocabOverview).not.toHaveBeenCalled();
  });

  it.each(['TUTOR', 'ADMIN'])('sends a %s to the dashboard, reading nothing', async (role) => {
    auth.mockResolvedValue({ user: { id: 'user-1', role } });
    await expect(WordsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/dashboard', locale: 'en' });
    expect(loadVocabOverview).not.toHaveBeenCalled();
  });

  it('renders the overview in UTC on the server, then refreshes in the browser’s zone', async () => {
    vocabOverviewAction.mockResolvedValue({ ok: true, value: { ...OVERVIEW, dueNow: 5 } });
    await renderPage();
    expect(loadVocabOverview).toHaveBeenCalledWith({
      userId: 'user-1',
      uiLocale: 'en',
      timeZone: 'UTC',
    });
    expect(vocabOverviewAction).toHaveBeenCalledWith({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(await screen.findByText('5 words to review')).toBeInTheDocument();
  });

  it('keeps the server counts when the refresh fails', async () => {
    vocabOverviewAction.mockRejectedValue(new Error('offline'));
    await renderPage();
    expect(screen.getByText('3 words to review')).toBeInTheDocument();
  });

  it('shows today’s allowance, the five stages and the topic levels', async () => {
    await renderPage();
    expect(screen.getByText('New words today: 2 of 10')).toBeInTheDocument();
    expect(screen.getByText('8 new words left for today')).toBeInTheDocument();
    for (const [stage, count] of [
      ['new', '4'],
      ['learning', '2'],
      ['familiar', '0'],
      ['known', '1'],
      ['mastered', '0'],
    ] as const) {
      const box = document.querySelector(`[data-stage="${stage}"]`) as HTMLElement;
      expect(within(box).getByText(w.stages[stage])).toBeInTheDocument();
      expect(within(box).getByText(count)).toBeInTheDocument();
    }
    const travel = document.querySelector('[data-topic="travel"]') as HTMLElement;
    expect(within(travel).getByText('3 of 7 words started')).toBeInTheDocument();
  });

  it('starts a whole-pool session, or one topic level', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: w.start })).toHaveAttribute('href', '/words/practice');
    expect(screen.getByRole('link', { name: 'Travel, level A2: practise' })).toHaveAttribute(
      'href',
      '/words/practice?concept=vocab.travel.a2',
    );
  });

  it('never shows an FSRS number', async () => {
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/stability|difficulty|pKnown/i);
  });
});

describe('daily limit', () => {
  it('saves a new limit and refreshes the overview', async () => {
    await renderPage();
    fireEvent.change(limitInput(), { target: { value: '20' } });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('status')).toHaveTextContent(w.limit.saved);
    expect(updateDailyVocabLimitAction).toHaveBeenCalledExactlyOnceWith({ dailyVocabLimit: 20 });
    await waitFor(() => expect(vocabOverviewAction).toHaveBeenCalledTimes(2));
  });

  it.each(['0', '51', '2.5', ''])('refuses %j inline, sending nothing', async (value) => {
    await renderPage();
    fireEvent.change(limitInput(), { target: { value } });
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 50.');
    expect(updateDailyVocabLimitAction).not.toHaveBeenCalled();
  });

  it('a lost save offers Retry, focused, which resends the same value', async () => {
    updateDailyVocabLimitAction.mockRejectedValueOnce(new Error('offline'));
    await renderPage();
    fireEvent.change(limitInput(), { target: { value: '25' } });
    fireEvent.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(w.limit.failed);
    const retry = within(alert).getByRole('button', { name: w.limit.retry });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    expect(limitInput()).toHaveValue(25);

    fireEvent.click(retry);
    expect(await screen.findByRole('status')).toHaveTextContent(w.limit.saved);
    expect(updateDailyVocabLimitAction).toHaveBeenCalledTimes(2);
    expect(updateDailyVocabLimitAction).toHaveBeenLastCalledWith({ dailyVocabLimit: 25 });
  });

  it('a refused save is reported the same way', async () => {
    updateDailyVocabLimitAction.mockResolvedValueOnce({ ok: false, error: 'UNAVAILABLE' });
    await renderPage();
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(w.limit.failed);
  });

  it('a double submit in the same tick sends once', async () => {
    await renderPage();
    const form = document.querySelector('[data-daily-limit-form]') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await screen.findByRole('status');
    expect(updateDailyVocabLimitAction).toHaveBeenCalledTimes(1);
  });
});
