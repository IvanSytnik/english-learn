import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreviewView } from '@/lib/vocab-import';
import en from '../../messages/en.json';

/** The paste dialog (B6.7) over mocked actions. */

const m = vi.hoisted(() => ({
  previewImportAction: vi.fn(),
  confirmImportAction: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@/app/[locale]/(student)/actions/word-import', () => ({
  previewImportAction: m.previewImportAction,
  confirmImportAction: m.confirmImportAction,
}));
vi.mock('@/lib/hard-reload', () => ({ hardReload: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => m.router }));

// jsdom has no modal dialogs: the open state and the close event are enough here.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

const { PasteImport } = await import(
  '@/app/[locale]/(student)/words/lists/_components/paste-import'
);
const I = en.student.words.import;
const LIST = 'clist000000000000000000001';
const opt = (slug: string, headword: string, inList = false) => ({
  slug,
  headword,
  pos: 'NOUN' as const,
  level: 'A1' as const,
  gloss: `${headword}-ru`,
  inList,
});
const PREVIEW: ImportPreviewView = {
  glossLang: 'ru',
  matched: [
    { term: 'apple', options: [opt('apple-noun', 'apple')], preselected: 'apple-noun' },
    {
      term: 'work',
      options: [opt('work-verb', 'work'), opt('work-noun', 'work')],
      preselected: 'work-verb',
    },
    { term: 'dog', options: [opt('dog-noun', 'dog', true)], preselected: null },
  ],
  lemmatized: [
    { term: 'went', options: [opt('go-verb', 'go')], preselected: 'go-verb' },
    {
      term: 'saw',
      options: [opt('saw-noun', 'saw'), opt('see-verb', 'see')],
      preselected: 'saw-noun',
    },
  ],
  functionWords: ['was', 'the'],
  notFound: ['qwerty'],
  notProcessed: 2,
  skipped: 1,
  capacityLeft: 3,
};
const PASTE = 'apple, work, dog, went, saw, qwerty';

const renderDialog = (target: { listId: string } | { newList: true } = { listId: LIST }) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PasteImport target={target} maxChars={5000} />
    </NextIntlClientProvider>,
  );
const openAndPaste = (text = PASTE) => {
  fireEvent.click(screen.getByRole('button', { name: I.openLabel }));
  fireEvent.change(screen.getByRole('textbox', { name: I.textLabel }), { target: { value: text } });
};
const box = (slug: string) => document.querySelector(`[data-option="${slug}"]`) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  m.previewImportAction.mockResolvedValue({ ok: true, value: PREVIEW });
  m.confirmImportAction.mockResolvedValue({
    ok: true,
    value: { listId: LIST, added: 3, alreadyIn: 0, notFound: 0, didNotFit: 0 },
  });
});

describe('paste import dialog', () => {
  it('preview: groups, preselected words checked, words in the list disabled, counts', async () => {
    renderDialog();
    openAndPaste();
    expect(screen.getByText(`${PASTE.length} / 5000`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: I.preview }));
    await screen.findByText('Found (3)');
    expect(m.previewImportAction).toHaveBeenCalledWith({ text: PASTE, listId: LIST });
    expect(['apple-noun', 'work-verb', 'go-verb', 'saw-noun'].map((s) => box(s).checked)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([box('work-noun').checked, box('see-verb').checked]).toEqual([false, false]);
    expect(box('dog-noun')).toBeDisabled();
    expect(screen.getByText('Found as a form of another word (2)')).toBeInTheDocument();
    expect(screen.getByText('qwerty').closest('ul')).toHaveAttribute('lang', 'en');
    expect(screen.getByText(I.notFoundNote)).toBeInTheDocument();
    // Function words: their own group (V2-18c), no checkbox, not under "not found".
    const fn = document.querySelector('[data-import-group="functionWords"]') as HTMLElement;
    expect(fn).toHaveTextContent('Function words — not practised (2)');
    expect(fn).toHaveTextContent(I.functionWordsNote);
    expect([...fn.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['was', 'the']);
    expect(fn.querySelector('ul')).toHaveAttribute('lang', 'en');
    expect(fn.querySelector('input')).toBeNull();
    expect(document.querySelector('[data-import-group="notFound"]')).not.toHaveTextContent('was');
    expect(screen.getByText(/2 more items were not processed/)).toBeInTheDocument();
    expect(screen.getByText(/1 piece without English words was skipped/)).toBeInTheDocument();
    expect(screen.getByText('4 words selected')).toBeInTheDocument();
    expect(screen.getByText(/Only 3 more fit into this list/)).toBeInTheDocument();
  });

  it('confirm sends the chosen slugs only; the result is reported and the list refreshes', async () => {
    renderDialog();
    openAndPaste();
    fireEvent.click(screen.getByRole('button', { name: I.preview }));
    await screen.findByText('Found (3)');
    fireEvent.click(box('saw-noun'));
    fireEvent.click(box('see-verb'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 4 words' }));
    await screen.findByText('Added: 3. Already in the list: 0. Did not fit: 0.');
    expect(m.confirmImportAction).toHaveBeenCalledWith({
      slugs: ['apple-noun', 'work-verb', 'go-verb', 'see-verb'],
      listId: LIST,
    });
    expect(JSON.stringify(m.confirmImportAction.mock.calls)).not.toContain('qwerty');
    expect(m.router.refresh).toHaveBeenCalled();
  });

  it('a new list from text needs a name, then opens the new list', async () => {
    renderDialog({ newList: true });
    fireEvent.click(screen.getByRole('button', { name: en.student.words.lists.create.fromText }));
    fireEvent.change(screen.getByRole('textbox', { name: I.textLabel }), {
      target: { value: PASTE },
    });
    fireEvent.click(screen.getByRole('button', { name: I.preview }));
    await screen.findByText('Found (3)');
    expect(m.previewImportAction).toHaveBeenCalledWith({ text: PASTE });
    fireEvent.click(screen.getByRole('button', { name: 'Create the list with 4 words' }));
    expect(screen.getByRole('alert')).toHaveTextContent(I.titleNeeded);
    expect(m.confirmImportAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: I.listTitleLabel }), {
      target: { value: ' Trip ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create the list with 4 words' }));
    await waitFor(() => expect(m.router.push).toHaveBeenCalledWith(`/words/lists/${LIST}`));
    expect(m.confirmImportAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Trip' }));
  });

  it('nothing selected: a message, no request', async () => {
    renderDialog();
    openAndPaste();
    fireEvent.click(screen.getByRole('button', { name: I.preview }));
    await screen.findByText('Found (3)');
    for (const s of ['apple-noun', 'work-verb', 'go-verb', 'saw-noun']) fireEvent.click(box(s));
    fireEvent.click(screen.getByRole('button', { name: 'Add 0 words' }));
    expect(screen.getByRole('alert')).toHaveTextContent(I.nothingSelected);
    expect(m.confirmImportAction).not.toHaveBeenCalled();
  });

  it.each([
    ['TOO_LONG', 'The text is longer than 5000 characters.'],
    ['EMPTY', I.empty],
    ['RATE_LIMITED', en.student.words.lists.errors.rateLimited],
  ])('%s is explained, without Retry', async (error, text) => {
    m.previewImportAction.mockResolvedValueOnce({ ok: false, error });
    renderDialog();
    openAndPaste();
    fireEvent.click(screen.getByRole('button', { name: I.preview }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('button', { name: en.student.words.lists.retry })).toBeNull();
  });

  it('a lost reply offers Retry, which asks again; one request at a time', async () => {
    m.previewImportAction.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderDialog();
    openAndPaste();
    const preview = screen.getByRole('button', { name: I.preview });
    act(() => {
      fireEvent.click(preview);
      fireEvent.click(preview);
    });
    expect(m.previewImportAction).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: en.student.words.lists.retry }));
    await screen.findByText('Found (3)');
    expect(m.previewImportAction).toHaveBeenCalledTimes(2);
  });

  it('closing forgets the text (V2-17)', async () => {
    renderDialog();
    openAndPaste();
    fireEvent.click(screen.getByRole('button', { name: I.close }));
    expect(document.body.textContent).not.toContain('qwerty');
    fireEvent.click(screen.getByRole('button', { name: I.openLabel }));
    expect(screen.getByRole('textbox', { name: I.textLabel })).toHaveValue('');
  });
});
