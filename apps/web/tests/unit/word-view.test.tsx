import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordPageView } from '@/lib/vocab-word';
import en from '../../messages/en.json';

const { setWordPreferenceAction, submitBetaFeedbackAction, wordListMenuAction, hardReload } =
  vi.hoisted(() => ({
    setWordPreferenceAction: vi.fn(),
    submitBetaFeedbackAction: vi.fn(),
    wordListMenuAction: vi.fn(),
    hardReload: vi.fn(),
  }));
vi.mock('@/app/[locale]/(student)/actions/vocab-preferences', () => ({
  setWordPreferenceAction,
  prioritizeLevelAction: vi.fn(),
}));
vi.mock('@/app/[locale]/(student)/actions/feedback', () => ({ submitBetaFeedbackAction }));
vi.mock('@/app/[locale]/(student)/actions/word-lists', () => ({
  wordListMenuAction,
  addWordsToListAction: vi.fn(),
  createWordListAction: vi.fn(),
}));
vi.mock('@/lib/hard-reload', () => ({ hardReload }));
vi.mock('@/app/_components/top-bar-controls', () => ({ TopBarControls: () => null }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: ReactNode;
  }) => (
    <a
      href={
        typeof href === 'string'
          ? href
          : `${href.pathname}${href.query ? `?${new URLSearchParams(href.query)}` : ''}`
      }
      {...rest}
    >
      {children}
    </a>
  ),
}));

const { WordView } = await import('@/app/[locale]/(student)/words/w/[slug]/word-view');

const w = en.student.words.word;
const b = en.student.words.browse;

const VIEW: WordPageView = {
  slug: 'luggage-noun',
  headword: 'luggage',
  pos: 'NOUN',
  level: 'A2',
  ipa: 'ˈlʌɡɪdʒ',
  gloss: 'багаж',
  glossLang: 'ru',
  definition: 'bags and cases that you take with you when you travel',
  examples: [
    { sentence: 'My luggage is heavy.', translation: 'Мой багаж тяжёлый.' },
    { sentence: 'Where is the luggage?', translation: null },
  ],
  collocations: ['heavy luggage', 'luggage allowance'],
  topic: { id: 'travel', title: 'Travel' },
  collections: [{ key: 'clothes', title: 'Clothes' }],
  badge: 'not_started',
  preference: null,
  review: { kind: 'none' },
  practice: { concept: 'vocab.travel.a2' },
};

function renderView(over: Partial<WordPageView> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WordView view={{ ...VIEW, ...over }} />
    </NextIntlClientProvider>,
  );
}
const buttons = () =>
  within(document.querySelector('[data-preference]') as HTMLElement)
    .getAllByRole('button')
    .map((el) => el.textContent);
const progress = () => document.querySelector('[data-preference]') as HTMLElement;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setWordPreferenceAction.mockImplementation(async ({ change }: { change: string }) => ({
    ok: true,
    value: {
      preference: change === 'prioritize' ? 'PRIORITIZED' : change === 'hide' ? 'HIDDEN' : null,
    },
  }));
  submitBetaFeedbackAction.mockResolvedValue({ ok: true, value: undefined });
});

describe('the word page (B6.8)', () => {
  it('the word: English headword, POS, level, IPA, gloss in the learner’s language, definition', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'luggage' })).toHaveAttribute(
      'lang',
      'en',
    );
    expect(screen.getByText('noun')).toBeVisible();
    expect(screen.getByText('A2')).toBeVisible();
    expect(screen.getByText('/ˈlʌɡɪdʒ/')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('багаж')).toHaveAttribute('lang', 'ru');
    expect(screen.getByText(VIEW.definition as string)).toHaveAttribute('lang', 'en');
  });

  it('examples with their translation when there is one, and collocations', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 2, name: w.examples })).toBeVisible();
    const examples = document.querySelectorAll('[data-example]');
    expect(examples).toHaveLength(2);
    expect(within(examples[0] as HTMLElement).getByText('My luggage is heavy.')).toHaveAttribute(
      'lang',
      'en',
    );
    expect(within(examples[0] as HTMLElement).getByText('Мой багаж тяжёлый.')).toHaveAttribute(
      'lang',
      'ru',
    );
    expect((examples[1] as HTMLElement).querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: w.collocations })).toBeVisible();
    expect([...document.querySelectorAll('[data-collocation]')].map((e) => e.textContent)).toEqual([
      'heavy luggage',
      'luggage allowance',
    ]);
  });

  it('a word without IPA, definition, examples or collocations shows none of their sections', () => {
    renderView({ ipa: null, definition: null, examples: [], collocations: [] });
    expect(document.querySelector('[data-ipa]')).toBeNull();
    expect(document.querySelector('[data-definition]')).toBeNull();
    expect(screen.queryByRole('heading', { name: w.examples })).toBeNull();
    expect(screen.queryByRole('heading', { name: w.collocations })).toBeNull();
  });

  it('where to find it: its topic and collections link to their pages', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Topic: Travel' })).toHaveAttribute(
      'href',
      '/words/topics/travel',
    );
    expect(screen.getByRole('link', { name: 'Clothes' })).toHaveAttribute(
      'href',
      '/words/collections/clothes',
    );
  });

  it.each([
    [{ kind: 'none' }, w.review.none],
    [{ kind: 'due' }, w.review.due],
    [{ kind: 'today' }, w.review.today],
    [{ kind: 'inDays', days: 1 }, 'Next review in 1 day'],
    [{ kind: 'inDays', days: 12 }, 'Next review in 12 days'],
  ] as const)('the next review %o reads “%s”, next to the stage word', (review, text) => {
    renderView({ review, badge: 'reviewing' });
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByText(b.badge.reviewing)).toBeVisible();
  });

  it('a new word offers Prioritize, I know (its proof in the topic level) and Hide', () => {
    renderView();
    expect(buttons()).toEqual([
      b.actions.prioritize,
      b.actions.hide,
      en.student.words.addToList.button,
    ]);
    expect(screen.getByRole('link', { name: 'I know “luggage”: prove it' })).toHaveAttribute(
      'href',
      '/words/practice?prove=luggage-noun&concept=vocab.travel.a2',
    );
  });

  it('a started word offers Hide only; a hidden one Unhide only', () => {
    const { unmount } = renderView({ badge: 'learning' });
    expect(buttons()).toEqual([b.actions.hide, en.student.words.addToList.button]);
    expect(screen.queryByRole('link', { name: /^I know/ })).toBeNull();
    unmount();
    renderView({ preference: 'HIDDEN' });
    expect(buttons()).toEqual([b.actions.unhide]);
    expect(screen.getByText(b.hidden)).toBeVisible();
  });

  it('Prioritize changes at once, names the word by slug and is announced', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: b.actions.prioritize }));
    expect(progress()).toHaveAttribute('data-preference', 'PRIORITIZED');
    expect(screen.getByText(b.prioritized)).toBeVisible();
    expect(setWordPreferenceAction).toHaveBeenCalledWith({
      slug: 'luggage-noun',
      change: 'prioritize',
    });
    expect(await screen.findByText('luggage: prioritized')).toBeInTheDocument();
  });

  it('a refused change goes back, says why, and Retry sends it again', async () => {
    setWordPreferenceAction.mockResolvedValueOnce({ ok: false, error: 'RATE_LIMITED' });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: b.actions.hide }));
    expect(await screen.findByRole('alert')).toHaveTextContent(b.rateLimited);
    expect(progress()).toHaveAttribute('data-preference', 'NONE');
    fireEvent.click(screen.getByRole('button', { name: b.retry }));
    await waitFor(() => expect(progress()).toHaveAttribute('data-preference', 'HIDDEN'));
    expect(setWordPreferenceAction).toHaveBeenLastCalledWith({
      slug: 'luggage-noun',
      change: 'hide',
    });
  });

  it('a lost reply also goes back, with Retry; one request at a time', async () => {
    let reject: (e: Error) => void = () => {};
    setWordPreferenceAction.mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    renderView();
    fireEvent.click(screen.getByRole('button', { name: b.actions.hide }));
    // The same element is now Unhide: a second click while the first is in flight is ignored.
    fireEvent.click(screen.getByRole('button', { name: b.actions.unhide }));
    expect(setWordPreferenceAction).toHaveBeenCalledTimes(1);
    await act(async () => reject(new TypeError('Failed to fetch')));
    expect(await screen.findByRole('alert')).toHaveTextContent(b.failed);
    expect(progress()).toHaveAttribute('data-preference', 'NONE');
  });

  it('“Report an issue” sends a report about this word by its slug', async () => {
    window.history.replaceState(null, '', '/en/words/w/luggage-noun');
    renderView();
    fireEvent.click(screen.getByRole('button', { name: en.feedback.reportIssue }));
    fireEvent.change(screen.getByRole('textbox', { name: en.feedback.textLabel }), {
      target: { value: 'The example is wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.feedback.submit }));
    await waitFor(() =>
      expect(submitBetaFeedbackAction).toHaveBeenCalledWith({
        kind: 'CONTENT_ERROR',
        text: 'The example is wrong',
        url: '/en/words/w/luggage-noun',
        wordSlug: 'luggage-noun',
      }),
    );
  });

  it('no model number is rendered (Axiom 4)', () => {
    const { container } = renderView({ badge: 'reviewing', review: { kind: 'inDays', days: 3 } });
    expect(container.textContent).not.toMatch(/stability|%|0\.\d/);
  });
});
