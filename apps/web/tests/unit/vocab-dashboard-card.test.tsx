import { render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const { auth, redirect, loadStudentDashboard, vocabOverviewAction } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((_: { href: string; locale: string }) => {
    throw new Error('NEXT_REDIRECT');
  }),
  loadStudentDashboard: vi.fn(),
  vocabOverviewAction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth, signOut: vi.fn() }));
vi.mock('@/lib/dashboard', () => ({ loadStudentDashboard }));
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/app/_components/top-bar-controls', () => ({ TopBarControls: () => null }));
vi.mock('@/app/[locale]/(student)/_components/feedback-button', () => ({
  FeedbackButton: () => null,
}));
vi.mock('@/app/[locale]/(student)/_components/week-rhythm-panel', () => ({
  WeekRhythmPanel: () => null,
}));
vi.mock('@/app/[locale]/(student)/dashboard/concept-list', () => ({ ConceptList: () => null }));
vi.mock('@/i18n/navigation', () => ({
  redirect,
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'en', messages: en, namespace: namespace as 'common' }),
}));
vi.mock('@/app/[locale]/(student)/actions/vocab', () => ({ vocabOverviewAction }));

const { default: DashboardPage } = await import('@/app/[locale]/(student)/dashboard/page');
const { VocabDashboardCard } = await import(
  '@/app/[locale]/(student)/_components/vocab-dashboard-card'
);

const v = en.student.dashboard.vocab;
const STAGES = { new: 4, learning: 2, familiar: 1, known: 0, mastered: 3 };
const VOCAB = {
  totalWords: 10,
  dueNow: 0,
  newToday: 3,
  dailyLimit: 10,
  remainingNew: 7,
  stages: STAGES,
};
/** What the action returns: the whole `/words` overview. */
const overview = (over: Record<string, unknown> = {}) => ({
  ...VOCAB,
  startedWords: 6,
  topics: [{ topicId: 'travel', title: 'Travel', total: 10, started: 6, stages: STAGES }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // The browser-zone refresh after mounting: by default the same counts.
  vocabOverviewAction.mockResolvedValue({ ok: true, value: overview() });
});

async function renderCard(initial = VOCAB) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VocabDashboardCard initial={initial} />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(vocabOverviewAction).toHaveBeenCalled());
  return view;
}

const cta = () => document.querySelector('[data-vocab-cta]') as HTMLAnchorElement;

describe('VocabDashboardCard', () => {
  it('words due: the review CTA with the count, into the session', async () => {
    vocabOverviewAction.mockResolvedValue({ ok: true, value: overview({ dueNow: 5 }) });
    await renderCard({ ...VOCAB, dueNow: 5 });
    expect(screen.getByText('5 words to review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review words (5)' })).toHaveAttribute(
      'href',
      '/words/practice',
    );
  });

  it('nothing due, new words left: learn words, into the session', async () => {
    await renderCard();
    expect(screen.getByText('Nothing to review right now')).toBeInTheDocument();
    expect(screen.getByText('New words today: 3 of 10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: v.learn })).toHaveAttribute('href', '/words/practice');
  });

  it('nothing due, today’s limit used up: the overview instead of a session', async () => {
    const spent = { ...VOCAB, newToday: 10, remainingNew: 0 };
    vocabOverviewAction.mockResolvedValue({ ok: true, value: overview(spent) });
    await renderCard(spent);
    expect(screen.getByText('New words today: 10 of 10')).toBeInTheDocument();
    expect(cta()).toHaveAttribute('data-vocab-cta', 'open');
    expect(screen.getByRole('link', { name: v.open })).toHaveAttribute('href', '/words');
  });

  it('always links to all topics', async () => {
    await renderCard();
    expect(screen.getByRole('link', { name: v.allTopics })).toHaveAttribute('href', '/words');
  });

  it('shows the five stages by word, with their counts', async () => {
    await renderCard();
    for (const [stage, count] of Object.entries(STAGES)) {
      const box = document.querySelector(`[data-stage="${stage}"]`) as HTMLElement;
      expect(
        within(box).getByText(en.student.words.stages[stage as keyof typeof STAGES]),
      ).toBeInTheDocument();
      expect(within(box).getByText(String(count))).toBeInTheDocument();
    }
  });

  it('refreshes once in the browser’s time zone', async () => {
    vocabOverviewAction.mockResolvedValue({ ok: true, value: overview({ dueNow: 4 }) });
    await renderCard();
    expect(vocabOverviewAction).toHaveBeenCalledExactlyOnceWith({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(await screen.findByRole('link', { name: 'Review words (4)' })).toBeInTheDocument();
  });

  it.each([
    ['a lost refresh', () => vocabOverviewAction.mockRejectedValue(new Error('offline'))],
    [
      'a refused refresh',
      () => vocabOverviewAction.mockResolvedValue({ ok: false, error: 'UNAVAILABLE' }),
    ],
  ])('%s keeps the UTC snapshot', async (_, fail) => {
    fail();
    await renderCard();
    expect(screen.getByText('New words today: 3 of 10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: v.learn })).toBeInTheDocument();
  });

  it('never shows an FSRS number, even if the refresh carried one', async () => {
    vocabOverviewAction.mockResolvedValue({
      ok: true,
      value: overview({ stability: 12.345, pKnown: 0.4321 }),
    });
    const { container } = await renderCard();
    await waitFor(() => expect(container.textContent).toContain('New words today'));
    expect(container.textContent).not.toMatch(/stability|difficulty|pKnown|12\.345|0\.4321|Travel/);
  });
});

describe('dashboard page', () => {
  const student = (vocab: typeof VOCAB | null) => ({
    diagnosticDone: true,
    level: 'B1',
    cta: { kind: 'practice' },
    showWeekRhythm: false,
    sections: [],
    vocab,
  });

  async function renderPage() {
    const page = await DashboardPage();
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        {page}
      </NextIntlClientProvider>,
    );
  }

  it('a learner sees the vocabulary card', async () => {
    auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT', name: 'Ada' } });
    loadStudentDashboard.mockResolvedValue(student(VOCAB));
    await renderPage();
    expect(loadStudentDashboard).toHaveBeenCalledWith({ userId: 'user-1', locale: 'en' });
    expect(screen.getByRole('heading', { name: v.title })).toBeInTheDocument();
    await waitFor(() => expect(vocabOverviewAction).toHaveBeenCalled());
  });

  it('a failed vocabulary read: the dashboard without the card', async () => {
    auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT', name: 'Ada' } });
    loadStudentDashboard.mockResolvedValue(student(null));
    await renderPage();
    expect(screen.getByRole('heading', { name: en.student.dashboard.title })).toBeInTheDocument();
    expect(document.querySelector('[data-vocab-card]')).toBeNull();
    expect(vocabOverviewAction).not.toHaveBeenCalled();
  });

  it.each(['TUTOR', 'ADMIN'])('a %s sees no card and reads nothing', async (role) => {
    auth.mockResolvedValue({ user: { id: 'user-1', role, name: 'Ada' } });
    await renderPage();
    expect(screen.getByRole('heading', { name: en.student.dashboard.title })).toBeInTheDocument();
    expect(loadStudentDashboard).not.toHaveBeenCalled();
    expect(document.querySelector('[data-vocab-card]')).toBeNull();
    expect(vocabOverviewAction).not.toHaveBeenCalled();
  });
});
