import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordRowView, WordsPage, WordsPageView } from '@/lib/vocab-words';
import en from '../../messages/en.json';

const { setWordPreferenceAction, prioritizeLevelAction, hardReload } = vi.hoisted(() => ({
  setWordPreferenceAction: vi.fn(),
  prioritizeLevelAction: vi.fn(),
  hardReload: vi.fn(),
}));
vi.mock('@/lib/hard-reload', () => ({ hardReload }));
vi.mock('@/app/[locale]/(student)/actions/vocab-preferences', () => ({
  setWordPreferenceAction,
  prioritizeLevelAction,
}));
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

const { WordsBrowser } = await import('@/app/[locale]/(student)/words/_browse/words-browser');

const b = en.student.words.browse;
const word = (headword: string, over: Partial<WordRowView> = {}): WordRowView => ({
  slug: `${headword}-noun`,
  headword,
  pos: 'NOUN',
  level: 'A1',
  gloss: `${headword}-uk`,
  badge: 'notStarted',
  preference: null,
  ...over,
});
const TOPIC: WordsPage = { kind: 'topic', topic: 'food_drink' };
const VIEW: WordsPageView = {
  title: 'Food and drink',
  glossLang: 'uk',
  total: 5,
  page: 1,
  pageCount: 1,
  groups: [
    {
      level: 'A1',
      prioritizable: 3,
      practice: { concept: 'vocab.food_drink.a1' },
      words: [
        word('apple'),
        word('bread'),
        word('cake', { preference: 'PRIORITIZED' }),
        word('dates', { badge: 'reviewing' }),
        word('eggs', { preference: 'HIDDEN' }),
      ],
    },
    {
      level: 'A2',
      prioritizable: 1,
      practice: { concept: 'vocab.food_drink.a2' },
      words: [word('soup', { level: 'A2' })],
    },
  ],
};

function renderBrowser(view: WordsPageView = VIEW, page: WordsPage = TOPIC) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WordsBrowser page={page} view={view} />
    </NextIntlClientProvider>,
  );
}
const row = (slug: string) => document.querySelector(`[data-word="${slug}"]`) as HTMLElement;
const inRow = (slug: string) => within(row(slug));
const button = (slug: string, name: string | RegExp) => inRow(slug).getByRole('button', { name });
const levelButton = (level: string) =>
  document.querySelector(`[data-prioritize-level="${level}"]`) as HTMLButtonElement | null;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setWordPreferenceAction.mockImplementation(async ({ change }: { change: string }) => ({
    ok: true,
    value: {
      preference: change === 'prioritize' ? 'PRIORITIZED' : change === 'hide' ? 'HIDDEN' : null,
    },
  }));
});

describe('rows', () => {
  it('headword (English) · POS · level · gloss in the learner’s language · badge word', () => {
    renderBrowser();
    expect(screen.getByRole('heading', { level: 1, name: 'Food and drink' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Level A1' })).toBeVisible();
    const apple = inRow('apple-noun');
    expect(apple.getByText('apple')).toHaveAttribute('lang', 'en');
    expect(apple.getByText('noun')).toBeVisible();
    expect(apple.getByText('A1')).toBeVisible();
    expect(apple.getByText('apple-uk')).toHaveAttribute('lang', 'uk');
    expect(apple.getByText(b.badge.notStarted)).toBeVisible();
    expect(inRow('dates-noun').getByText(b.badge.reviewing)).toBeVisible();
    expect(screen.getByText('5 words')).toBeVisible();
  });

  it('a new word offers Prioritize, I know and Hide; I know opens its proof in the level’s session', () => {
    renderBrowser();
    expect(button('apple-noun', 'Prioritize “apple”')).toHaveTextContent(b.actions.prioritize);
    expect(button('apple-noun', 'Hide “apple”')).toBeVisible();
    expect(
      inRow('apple-noun').getByRole('link', { name: 'I know “apple”: prove it' }),
    ).toHaveAttribute('href', '/words/practice?prove=apple-noun&concept=vocab.food_drink.a1');
  });

  it('a started word offers Hide only; a prioritized one says so and offers Unprioritize', () => {
    renderBrowser();
    expect(
      inRow('dates-noun')
        .getAllByRole('button')
        .map((el) => el.textContent),
    ).toEqual([b.actions.hide]);
    expect(inRow('dates-noun').queryByRole('link')).toBeNull();
    expect(inRow('cake-noun').getByText(b.prioritized)).toBeVisible();
    expect(button('cake-noun', 'Unprioritize “cake”')).toBeVisible();
  });

  it('a hidden word is muted, labelled Hidden (not by colour alone), and offers Unhide only', () => {
    renderBrowser();
    expect(row('eggs-noun')).toHaveAttribute('data-preference', 'HIDDEN');
    expect(inRow('eggs-noun').getByText(b.hidden)).toBeVisible();
    expect(inRow('eggs-noun').getByText('eggs')).toHaveClass('text-ink-muted');
    expect(
      inRow('eggs-noun')
        .getAllByRole('button')
        .map((el) => el.textContent),
    ).toEqual([b.actions.unhide]);
    expect(inRow('eggs-noun').queryByRole('link')).toBeNull();
  });

  it('a collection page practises in the collection', () => {
    renderBrowser(
      { ...VIEW, groups: [{ ...VIEW.groups[0], practice: { collection: 'clothes' } } as never] },
      { kind: 'collection', key: 'clothes' },
    );
    expect(inRow('apple-noun').getByRole('link', { name: /apple/ })).toHaveAttribute(
      'href',
      '/words/practice?prove=apple-noun&collection=clothes',
    );
    expect(screen.getByRole('link', { name: b.practise })).toHaveAttribute(
      'href',
      '/words/practice?collection=clothes',
    );
  });
});

describe('optimistic actions', () => {
  it('Prioritize shows at once, before the reply; the reply is announced', async () => {
    let reply: (v: unknown) => void = () => {};
    setWordPreferenceAction.mockImplementationOnce(() => new Promise((r) => (reply = r)));
    renderBrowser();
    fireEvent.click(button('apple-noun', 'Prioritize “apple”'));
    expect(row('apple-noun')).toHaveAttribute('data-preference', 'PRIORITIZED');
    expect(inRow('apple-noun').getByText(b.prioritized)).toBeVisible();
    expect(levelButton('A1')).toHaveTextContent('Prioritize this level (2)');
    expect(setWordPreferenceAction).toHaveBeenCalledExactlyOnceWith({
      slug: 'apple-noun',
      change: 'prioritize',
    });
    await act(async () => reply({ ok: true, value: { preference: 'PRIORITIZED' } }));
    expect(screen.getByRole('status')).toHaveTextContent('apple: prioritized');
  });

  it.each([
    [
      'refused for the budget',
      () => setWordPreferenceAction.mockResolvedValueOnce({ ok: false, error: 'RATE_LIMITED' }),
      b.rateLimited,
    ],
    ['lost', () => setWordPreferenceAction.mockRejectedValueOnce(new Error('offline')), b.failed],
    [
      'refused, unpublished',
      () => setWordPreferenceAction.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' }),
      b.notFound,
    ],
  ])('%s: the row goes back and says why, with a Retry that sends the same change', async (_, fail, text) => {
    fail();
    renderBrowser();
    fireEvent.click(button('apple-noun', 'Hide “apple”'));
    const alert = await inRow('apple-noun').findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(row('apple-noun')).toHaveAttribute('data-preference', 'NONE');
    expect(levelButton('A1')).toHaveTextContent('Prioritize this level (3)');
    fireEvent.click(within(alert).getByRole('button', { name: b.retry }));
    await waitFor(() => expect(row('apple-noun')).toHaveAttribute('data-preference', 'HIDDEN'));
    expect(setWordPreferenceAction.mock.calls).toEqual([
      [{ slug: 'apple-noun', change: 'hide' }],
      [{ slug: 'apple-noun', change: 'hide' }],
    ]);
    await waitFor(() => expect(inRow('apple-noun').queryByRole('alert')).toBeNull());
  });

  it('Hide keeps focus on the same button, now Unhide; Unhide brings the actions back', async () => {
    renderBrowser();
    const hide = button('apple-noun', 'Hide “apple”');
    hide.focus();
    fireEvent.click(hide);
    expect(hide).toHaveAccessibleName('Unhide “apple”');
    expect(hide).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('apple: hidden'));
    fireEvent.click(hide);
    expect(button('apple-noun', 'Prioritize “apple”')).toBeVisible();
    expect(setWordPreferenceAction).toHaveBeenLastCalledWith({
      slug: 'apple-noun',
      change: 'unhide',
    });
  });

  it('one request per word in flight: a double click sends once', () => {
    setWordPreferenceAction.mockImplementation(() => new Promise(() => {}));
    renderBrowser();
    const hide = button('apple-noun', 'Hide “apple”');
    // One tick: no re-render between the clicks, only the ref set before the call stops the second.
    act(() => {
      fireEvent.click(hide);
      fireEvent.click(hide);
    });
    expect(setWordPreferenceAction).toHaveBeenCalledTimes(1);
  });
});

describe('Prioritize this level', () => {
  it('marks the page’s eligible rows at once; the reply’s batch decides, the count is the server’s', async () => {
    let reply: (v: unknown) => void = () => {};
    prioritizeLevelAction.mockImplementationOnce(() => new Promise((r) => (reply = r)));
    renderBrowser();
    fireEvent.click(levelButton('A1') as HTMLButtonElement);
    expect(prioritizeLevelAction).toHaveBeenCalledExactlyOnceWith({ page: TOPIC, level: 'A1' });
    expect(row('apple-noun')).toHaveAttribute('data-preference', 'PRIORITIZED');
    expect(row('bread-noun')).toHaveAttribute('data-preference', 'PRIORITIZED');
    // Started and hidden words are never taken.
    expect(row('dates-noun')).toHaveAttribute('data-preference', 'NONE');
    expect(row('eggs-noun')).toHaveAttribute('data-preference', 'HIDDEN');
    // 3 = apple and bread here, one more on another page.
    expect(levelButton('A1')).toHaveTextContent('Prioritize this level (1)');
    fireEvent.click(levelButton('A1') as HTMLButtonElement);
    expect(prioritizeLevelAction).toHaveBeenCalledTimes(1);
    // Only `apple` was in this call's batch: `bread` goes back.
    await act(async () =>
      reply({ ok: true, value: { prioritized: 1, remaining: 1, slugs: ['apple-noun'] } }),
    );
    expect(row('bread-noun')).toHaveAttribute('data-preference', 'NONE');
    expect(levelButton('A1')).toHaveTextContent('Prioritize this level (1)');
    expect(screen.getByText('1 word prioritized. 1 more left — press again.')).toBeVisible();
    // The other level is untouched.
    expect(row('soup-noun')).toHaveAttribute('data-preference', 'NONE');
  });

  it('a lost or refused bulk puts every row and the count back, with a Retry', async () => {
    prioritizeLevelAction.mockRejectedValueOnce(new Error('offline'));
    prioritizeLevelAction.mockResolvedValueOnce({
      ok: true,
      value: { prioritized: 2, remaining: 0, slugs: ['apple-noun', 'bread-noun'] },
    });
    renderBrowser();
    fireEvent.click(levelButton('A1') as HTMLButtonElement);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(b.failed);
    expect(row('apple-noun')).toHaveAttribute('data-preference', 'NONE');
    expect(levelButton('A1')).toHaveTextContent('Prioritize this level (3)');
    fireEvent.click(within(alert).getByRole('button', { name: b.retry }));
    await waitFor(() => expect(screen.getByText('2 words prioritized.')).toBeVisible());
    expect(levelButton('A1')).toBeNull();
    expect(prioritizeLevelAction).toHaveBeenCalledTimes(2);
  });
});

describe('pages', () => {
  it('page 2 of 3: previous and next by `?page=`, the first page without it', () => {
    renderBrowser({ ...VIEW, page: 2, pageCount: 3 });
    const nav = screen.getByRole('navigation', { name: b.pages.label });
    expect(within(nav).getByRole('link', { name: b.pages.previous })).toHaveAttribute(
      'href',
      '/words/topics/food_drink',
    );
    expect(within(nav).getByRole('link', { name: b.pages.next })).toHaveAttribute(
      'href',
      '/words/topics/food_drink?page=3',
    );
    expect(within(nav).getByText('Page 2 of 3')).toBeVisible();
  });

  it('one page: no navigation; an empty page says so', () => {
    renderBrowser({ ...VIEW, total: 0, groups: [] });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText(b.empty)).toBeVisible();
  });
});
