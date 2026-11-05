import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  WordListPageView,
  WordListRowView,
  WordListsIndexView,
  WordSearchResult,
} from '@/lib/word-lists';
import en from '../../messages/en.json';

/** The lists index, a list's editor and the catalogue search (B6.7), over mocked actions. */

const actions = vi.hoisted(() => ({
  createWordListAction: vi.fn(),
  renameWordListAction: vi.fn(),
  archiveWordListAction: vi.fn(),
  restoreWordListAction: vi.fn(),
  addWordsToListAction: vi.fn(),
  removeWordFromListAction: vi.fn(),
  setWordListNoteAction: vi.fn(),
  moveWordInListAction: vi.fn(),
  searchWordsAction: vi.fn(),
  wordListMenuAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('@/app/[locale]/(student)/actions/word-lists', () => actions);
vi.mock('@/lib/hard-reload', () => ({ hardReload: vi.fn() }));
vi.mock('@/app/_components/top-bar-controls', () => ({ TopBarControls: () => null }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => router,
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

const { ListEditor } = await import('@/app/[locale]/(student)/words/lists/_components/list-editor');
const { ListsIndex } = await import('@/app/[locale]/(student)/words/lists/_components/lists-index');
const { WordSearch, SEARCH_DEBOUNCE_MS } = await import(
  '@/app/[locale]/(student)/words/lists/_components/word-search'
);

const L = en.student.words.list;
const LS = en.student.words.lists;
const S = en.student.words.search;
const LIST = 'cm9listabcdefghijklmnop1';

const word = (headword: string, over: Partial<WordListRowView> = {}): WordListRowView => ({
  slug: `${headword}-noun`,
  headword,
  pos: 'NOUN',
  level: 'A2',
  gloss: `${headword}-ru`,
  badge: 'not_started',
  note: null,
  ...over,
});
const VIEW: WordListPageView = {
  id: LIST,
  title: 'Trip',
  source: 'CUSTOM',
  archived: false,
  glossLang: 'ru',
  total: 3,
  page: 1,
  pageCount: 1,
  offset: 0,
  rows: [
    word('apple', { badge: 'learning' }),
    word('bread', { note: 'for breakfast' }),
    word('cake', { badge: 'known' }),
  ],
  prevSlug: null,
  nextSlug: null,
  unavailable: 0,
  capacity: 500,
};

const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    {node}
  </NextIntlClientProvider>
);
const renderEditor = (view: WordListPageView = VIEW) =>
  render(wrap(<ListEditor view={view} searchMinChars={2} />));
const order = () =>
  [...document.querySelectorAll('[data-row]')].map((el) => el.getAttribute('data-row'));
const inRow = (slug: string) =>
  within(document.querySelector(`[data-row="${slug}"]`) as HTMLElement);
const announced = () => document.querySelector('[data-announce]') as HTMLElement;
const ok = <T,>(value: T) => ({ ok: true as const, value });
const deferred = () => {
  let resolve: (v: unknown) => void = () => {};
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.moveWordInListAction.mockResolvedValue(ok({ moved: true }));
  actions.removeWordFromListAction.mockResolvedValue(ok({ removed: true }));
  actions.setWordListNoteAction.mockImplementation(async ({ note }: { note: string }) =>
    ok({ note: note.trim() || null }),
  );
  actions.renameWordListAction.mockImplementation(async ({ title }: { title: string }) =>
    ok({ title }),
  );
  actions.archiveWordListAction.mockResolvedValue(ok({ archived: true }));
  actions.restoreWordListAction.mockResolvedValue(ok({ restored: true }));
  actions.searchWordsAction.mockResolvedValue(ok({ results: [] }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a list page', () => {
  it('rows in list order: position, headword, POS, level, gloss in the learner’s language, stage word, note', () => {
    renderEditor();
    expect(order()).toEqual(['apple-noun', 'bread-noun', 'cake-noun']);
    const apple = inRow('apple-noun');
    expect(apple.getByText('1')).toBeVisible();
    expect(apple.getByText('apple')).toHaveAttribute('lang', 'en');
    expect(apple.getByText('apple-ru').closest('td')).toHaveAttribute('lang', 'ru');
    // The stage is a word, not a colour alone (V2-16).
    expect(apple.getByText(en.student.words.browse.badge.learning)).toBeVisible();
    expect(inRow('bread-noun').getByText('for breakfast')).toBeVisible();
    expect(screen.getByText('3 words of 500')).toBeVisible();
    expect(screen.getByRole('link', { name: L.practise })).toHaveAttribute(
      'href',
      `/words/practice?list=${LIST}`,
    );
  });

  it('the first row cannot move up, the last cannot move down (one page)', () => {
    renderEditor();
    expect(inRow('apple-noun').getByRole('button', { name: 'Move “apple” up' })).toBeDisabled();
    expect(inRow('cake-noun').getByRole('button', { name: 'Move “cake” down' })).toBeDisabled();
  });

  it('Move down moves at once, names the neighbour by slug, keeps focus on the control; the reply is announced', async () => {
    const reply = deferred();
    actions.moveWordInListAction.mockReturnValueOnce(reply.promise);
    renderEditor();
    const down = inRow('apple-noun').getByRole('button', { name: 'Move “apple” down' });
    down.focus();
    fireEvent.click(down);
    expect(order()).toEqual(['bread-noun', 'apple-noun', 'cake-noun']);
    expect(actions.moveWordInListAction).toHaveBeenCalledWith({
      listId: LIST,
      slug: 'apple-noun',
      anchor: { after: 'bread-noun' },
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        inRow('apple-noun').getByRole('button', { name: 'Move “apple” down' }),
      ),
    );
    await act(async () => reply.resolve(ok({ moved: true })));
    expect(announced()).toHaveTextContent('apple: moved to position 2');
  });

  it('at the bottom, focus goes to the twin control; one move per word in flight', async () => {
    const reply = deferred();
    actions.moveWordInListAction.mockReturnValueOnce(reply.promise);
    renderEditor();
    const down = inRow('bread-noun').getByRole('button', { name: 'Move “bread” down' });
    fireEvent.click(down);
    fireEvent.click(inRow('bread-noun').getByRole('button', { name: 'Move “bread” up' }));
    expect(actions.moveWordInListAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        inRow('bread-noun').getByRole('button', { name: 'Move “bread” up' }),
      ),
    );
    await act(async () => reply.resolve(ok({ moved: true })));
  });

  it('a refused move puts the row back with a Retry that sends it again', async () => {
    actions.moveWordInListAction.mockResolvedValueOnce({ ok: false, error: 'RATE_LIMITED' });
    renderEditor();
    fireEvent.click(inRow('cake-noun').getByRole('button', { name: 'Move “cake” up' }));
    expect(await screen.findByText(LS.errors.rateLimited)).toBeVisible();
    expect(order()).toEqual(['apple-noun', 'bread-noun', 'cake-noun']);
    fireEvent.click(screen.getByRole('button', { name: LS.retry }));
    expect(order()).toEqual(['apple-noun', 'cake-noun', 'bread-noun']);
    expect(actions.moveWordInListAction).toHaveBeenLastCalledWith({
      listId: LIST,
      slug: 'cake-noun',
      anchor: { before: 'bread-noun' },
    });
    await waitFor(() => expect(screen.queryByText(LS.errors.rateLimited)).toBeNull());
  });

  it('a lost reply (network) also puts the row back, with Retry', async () => {
    actions.moveWordInListAction.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderEditor();
    fireEvent.click(inRow('apple-noun').getByRole('button', { name: 'Move “apple” down' }));
    expect(await screen.findByText(LS.errors.failed)).toBeVisible();
    expect(order()).toEqual(['apple-noun', 'bread-noun', 'cake-noun']);
    expect(screen.getByRole('button', { name: LS.retry })).toBeVisible();
  });

  it('drag and drop: dropping on a later row places it after that row', () => {
    renderEditor();
    const rowOf = (slug: string) => document.querySelector(`[data-row="${slug}"]`) as HTMLElement;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(rowOf('apple-noun'), { dataTransfer });
    fireEvent.dragOver(rowOf('cake-noun'), { dataTransfer });
    fireEvent.drop(rowOf('cake-noun'), { dataTransfer });
    expect(order()).toEqual(['bread-noun', 'cake-noun', 'apple-noun']);
    expect(actions.moveWordInListAction).toHaveBeenCalledWith({
      listId: LIST,
      slug: 'apple-noun',
      anchor: { after: 'cake-noun' },
    });
  });

  it('across a page edge: page 2’s first word moves up before the last word of page 1, then the page refreshes', async () => {
    renderEditor({
      ...VIEW,
      page: 2,
      pageCount: 2,
      offset: 100,
      total: 103,
      prevSlug: 'zebra-noun',
    });
    expect(inRow('apple-noun').getByText('101')).toBeVisible();
    fireEvent.click(inRow('apple-noun').getByRole('button', { name: 'Move “apple” up' }));
    expect(actions.moveWordInListAction).toHaveBeenCalledWith({
      listId: LIST,
      slug: 'apple-noun',
      anchor: { before: 'zebra-noun' },
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(announced()).toHaveTextContent('apple: moved to another page');
  });

  it('Remove takes the row out at once; refused, it comes back with Retry', async () => {
    actions.removeWordFromListAction.mockResolvedValueOnce({ ok: false, error: 'UNAVAILABLE' });
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Remove “bread” from the list' }));
    expect(order()).toEqual(['apple-noun', 'cake-noun']);
    expect(screen.getByText('2 words of 500')).toBeVisible();
    expect(await screen.findByText(LS.errors.failed)).toBeVisible();
    expect(order()).toEqual(['apple-noun', 'bread-noun', 'cake-noun']);
    fireEvent.click(screen.getByRole('button', { name: LS.retry }));
    expect(order()).toEqual(['apple-noun', 'cake-noun']);
    expect(actions.removeWordFromListAction).toHaveBeenLastCalledWith({
      listId: LIST,
      slug: 'bread-noun',
    });
    await waitFor(() => expect(announced()).toHaveTextContent('bread: removed from the list'));
  });

  it('removing the only word of a later page shows the page before', async () => {
    renderEditor({
      ...VIEW,
      rows: [word('apple')],
      page: 2,
      pageCount: 2,
      offset: 100,
      total: 101,
      prevSlug: 'zebra-noun',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove “apple” from the list' }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({ pathname: `/words/lists/${LIST}` }),
    );
  });

  it('a note: add, counter, Save sends it; Escape cancels', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add a note to “apple”' }));
    const field = screen.getByRole('textbox', { name: 'Note for “apple”' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    fireEvent.change(field, { target: { value: 'red one' } });
    expect(screen.getByText('7/200')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: L.noteSave }));
    expect(inRow('apple-noun').getByText('red one')).toBeVisible();
    expect(actions.setWordListNoteAction).toHaveBeenCalledWith({
      listId: LIST,
      slug: 'apple-noun',
      note: 'red one',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit the note of “bread”' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note for “bread”' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('textbox', { name: 'Note for “bread”' })).toBeNull();
    expect(actions.setWordListNoteAction).toHaveBeenCalledTimes(1);
  });

  it('rename: the title changes at once; refused, it goes back, and Retry sends the same name', async () => {
    actions.renameWordListAction.mockResolvedValueOnce({ ok: false, error: 'UNAVAILABLE' });
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: L.rename }));
    fireEvent.change(screen.getByRole('textbox', { name: L.renameLabel }), {
      target: { value: '  London  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('London');
    expect(await screen.findByText(LS.errors.failed)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trip');
    fireEvent.click(screen.getByRole('button', { name: LS.retry }));
    expect(actions.renameWordListAction).toHaveBeenLastCalledWith({
      listId: LIST,
      title: 'London',
    });
    await waitFor(() => expect(announced()).toHaveTextContent('List renamed to “London”'));
  });

  it('an empty name is refused before any request', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: L.rename }));
    fireEvent.change(screen.getByRole('textbox', { name: L.renameLabel }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    expect(screen.getByText(LS.errors.invalidTitle)).toBeVisible();
    expect(actions.renameWordListAction).not.toHaveBeenCalled();
  });

  it('Archive goes back to the lists', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: L.archive }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/words/lists'));
    expect(actions.archiveWordListAction).toHaveBeenCalledWith({ listId: LIST });
  });

  it('an archived list is read-only: no search, no edits, no practice; Restore (50 active → the limit message)', async () => {
    actions.restoreWordListAction.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    renderEditor({ ...VIEW, archived: true });
    expect(screen.getByText(L.archivedNote)).toBeVisible();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Move|Remove|note/ })).toBeNull();
    expect(screen.queryByRole('link', { name: L.practise })).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: LS.restore }));
    expect(await screen.findByText(LS.errors.limit)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: LS.retry }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('an empty list says so and offers no practice', () => {
    renderEditor({ ...VIEW, rows: [], total: 0 });
    expect(screen.getByText(L.empty)).toBeVisible();
    expect(screen.queryByRole('link', { name: L.practise })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('pages: previous and next by `?page=`', () => {
    renderEditor({
      ...VIEW,
      page: 2,
      pageCount: 3,
      offset: 100,
      prevSlug: 'x-noun',
      nextSlug: 'y-noun',
    });
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      `/words/lists/${LIST}`,
    );
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
      'href',
      `/words/lists/${LIST}?page=3`,
    );
  });
});

describe('the lists index', () => {
  const at = '2026-11-04T10:00:00.000Z';
  const INDEX: WordListsIndexView = {
    maxActive: 50,
    active: [
      {
        id: LIST,
        title: 'Trip',
        count: 4,
        updatedAt: at,
        archivedAt: null,
        stages: { not_started: 2, learning: 1, reviewing: 0, known: 1 },
      },
      {
        id: 'cm9listabcdefghijklmnop2',
        title: 'Empty',
        count: 0,
        updatedAt: at,
        archivedAt: null,
        stages: { not_started: 0, learning: 0, reviewing: 0, known: 0 },
      },
    ],
    archived: [
      {
        id: 'cm9listabcdefghijklmnop3',
        title: 'Old',
        count: 7,
        updatedAt: at,
        archivedAt: at,
        stages: { not_started: 7, learning: 0, reviewing: 0, known: 0 },
      },
    ],
  };
  const renderIndex = (view: WordListsIndexView = INDEX) =>
    render(wrap(<ListsIndex view={view} />));
  const card = (id: string) =>
    within(document.querySelector(`[data-list-card="${id}"]`) as HTMLElement);

  it('active lists: title link, count, last change, the stages that have words (as words)', () => {
    renderIndex();
    const trip = card(LIST);
    expect(trip.getByRole('link', { name: 'Trip' })).toHaveAttribute(
      'href',
      `/words/lists/${LIST}`,
    );
    expect(trip.getByText(/4 words · Updated Nov 4, 2026/)).toBeVisible();
    const stages = trip.getByRole('list', { name: LS.stagesLabel });
    expect(
      within(stages)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Not started: 2', 'Learning: 1', 'Known: 1']);
    expect(card('cm9listabcdefghijklmnop2').queryByRole('list')).toBeNull();
    expect(screen.getByText('2 of 50 lists')).toBeVisible();
  });

  it('archived lists sit in a collapsed section with Restore', async () => {
    renderIndex();
    const section = document.querySelector('details[data-lists="archived"]') as HTMLDetailsElement;
    expect(section.open).toBe(false);
    expect(within(section).getByText('Archived lists (1)')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Restore “Old”', hidden: true }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.restoreWordListAction).toHaveBeenCalledWith({
      listId: 'cm9listabcdefghijklmnop3',
    });
  });

  it('a refused restore (50 active) says why, with Retry', async () => {
    actions.restoreWordListAction.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    renderIndex();
    fireEvent.click(screen.getByRole('button', { name: 'Restore “Old”', hidden: true }));
    expect(await screen.findByText(LS.errors.limit, undefined, {})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LS.retry, hidden: true })).toBeInTheDocument();
  });

  it('a new list opens on creation; an empty name is refused before any request', async () => {
    actions.createWordListAction.mockResolvedValueOnce(
      ok({ id: 'cm9newlistabcdefghijklm1', title: 'Food' }),
    );
    renderIndex();
    fireEvent.click(screen.getByRole('button', { name: LS.create.submit }));
    expect(screen.getByText(LS.errors.invalidTitle)).toBeVisible();
    expect(actions.createWordListAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: LS.create.label }), {
      target: { value: ' Food ' },
    });
    fireEvent.click(screen.getByRole('button', { name: LS.create.submit }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/words/lists/cm9newlistabcdefghijklm1'),
    );
    expect(actions.createWordListAction).toHaveBeenCalledWith({ title: 'Food' });
  });

  it('the 51st list is refused with the limit message and Retry', async () => {
    actions.createWordListAction.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    renderIndex();
    fireEvent.change(screen.getByRole('textbox', { name: LS.create.label }), {
      target: { value: 'One more' },
    });
    fireEvent.click(screen.getByRole('button', { name: LS.create.submit }));
    expect(await screen.findByText(LS.errors.limit)).toBeVisible();
    expect(screen.getByRole('button', { name: LS.retry })).toBeVisible();
  });

  it('at 50 active lists there is no form, only the reason', () => {
    const [first] = INDEX.active;
    if (!first) throw new Error('fixture');
    const full = Array.from({ length: 50 }, (_, i) => ({
      ...first,
      id: `cm9listabcdefghijklm${String(i).padStart(4, '0')}`,
    }));
    renderIndex({ ...INDEX, active: full });
    expect(screen.queryByRole('textbox', { name: LS.create.label })).toBeNull();
    expect(screen.getByText(LS.errors.limit)).toBeVisible();
  });
});

describe('the catalogue search', () => {
  const RESULTS: WordSearchResult[] = [
    {
      slug: 'apple-noun',
      headword: 'apple',
      pos: 'NOUN',
      level: 'A1',
      gloss: 'яблоко',
      inList: false,
    },
    {
      slug: 'apricot-noun',
      headword: 'apricot',
      pos: 'NOUN',
      level: 'B1',
      gloss: 'абрикос',
      inList: true,
    },
  ];
  const onAdded = vi.fn();
  const renderSearch = () =>
    render(
      wrap(
        <WordSearch
          listId={LIST}
          minChars={2}
          onAdded={onAdded}
          errorText={() => LS.errors.failed}
        />,
      ),
    );
  const type = (value: string) =>
    fireEvent.change(screen.getByRole('searchbox', { name: S.label }), { target: { value } });

  it('below 2 characters nothing is asked; typing is debounced: one request for the last query', async () => {
    vi.useFakeTimers();
    actions.searchWordsAction.mockResolvedValue(ok({ results: RESULTS }));
    renderSearch();
    type('a');
    await act(async () => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(actions.searchWordsAction).not.toHaveBeenCalled();
    expect(screen.getByText(S.hint)).toBeVisible();
    type('ap');
    await act(async () => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    type('app');
    await act(async () => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(actions.searchWordsAction).toHaveBeenCalledTimes(1);
    expect(actions.searchWordsAction).toHaveBeenCalledWith({ query: 'app', listId: LIST });
    expect(screen.getByText('2 results')).toBeVisible();
  });

  it('a word already in the list says so; Add names it by slug, then says In list', async () => {
    actions.searchWordsAction.mockResolvedValue(ok({ results: RESULTS }));
    actions.addWordsToListAction.mockResolvedValueOnce(
      ok({ added: 1, alreadyIn: 0, notFound: 0, didNotFit: 0 }),
    );
    renderSearch();
    type('ap');
    const apricot = await screen.findByText('apricot');
    expect(within(apricot.closest('li') as HTMLElement).getByText(S.inList)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add “apple” to the list' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add “apple” to the list' })).toBeNull(),
    );
    expect(actions.addWordsToListAction).toHaveBeenCalledWith({
      listId: LIST,
      slugs: ['apple-noun'],
    });
    expect(onAdded).toHaveBeenCalledWith(RESULTS[0]);
  });

  it('a slower answer to an older query never replaces the newer one', async () => {
    const slow = deferred();
    actions.searchWordsAction
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(ok({ results: [RESULTS[1]] }));
    renderSearch();
    type('ap');
    await waitFor(() => expect(actions.searchWordsAction).toHaveBeenCalledTimes(1));
    type('apr');
    expect(await screen.findByText('apricot')).toBeVisible();
    await act(async () => slow.resolve(ok({ results: [RESULTS[0]] })));
    expect(screen.queryByText('apple')).toBeNull();
  });

  it('a refused add stays addable, with the reason', async () => {
    actions.searchWordsAction.mockResolvedValue(ok({ results: RESULTS }));
    actions.addWordsToListAction.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    renderSearch();
    type('ap');
    fireEvent.click(await screen.findByRole('button', { name: 'Add “apple” to the list' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LS.errors.failed);
    expect(screen.getByRole('button', { name: 'Add “apple” to the list' })).toBeVisible();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
