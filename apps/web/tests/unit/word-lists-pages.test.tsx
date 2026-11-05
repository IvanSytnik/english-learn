import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** `/words/lists` and `/words/lists/[id]` (B6.7): students only; anything not theirs is a 404. */

const { requireRole, loadWordListPage, loadWordListsIndex, notFound } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadWordListPage: vi.fn(),
  loadWordListsIndex: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'uk' }));
vi.mock('@/lib/authz', () => ({ requireRole }));
vi.mock('@/lib/word-lists', () => ({ loadWordListPage, loadWordListsIndex }));
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/app/[locale]/(student)/words/lists/_components/list-editor', () => ({
  ListEditor: () => null,
}));
vi.mock('@/app/[locale]/(student)/words/lists/_components/lists-index', () => ({
  ListsIndex: () => null,
}));
vi.mock('@/app/[locale]/(student)/words/lists/_components/paste-import', () => ({
  PasteImport: () => null,
}));

const { default: WordListsPage } = await import('@/app/[locale]/(student)/words/lists/page');
const { default: WordListPage } = await import('@/app/[locale]/(student)/words/lists/[id]/page');
const { ListEditor } = await import('@/app/[locale]/(student)/words/lists/_components/list-editor');
const { ListsIndex } = await import('@/app/[locale]/(student)/words/lists/_components/lists-index');

const LIST = 'cm9listabcdefghijklmnop1';
const VIEW = { id: LIST, title: 'Trip', rows: [] };
type Params = Record<string, string | string[] | undefined>;
const openList = (id: string, searchParams: Params = {}) =>
  WordListPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) });
const child = (tree: ReactElement, type: unknown) =>
  (tree.props as { children: ReactElement[] }).children.find(
    (c) => c.type === type,
  ) as ReactElement;

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: 'user-1', role: 'STUDENT' });
  loadWordListPage.mockResolvedValue(VIEW);
  loadWordListsIndex.mockResolvedValue({ active: [], archived: [], maxActive: 50 });
});

describe('/words/lists', () => {
  it('a student’s own lists', async () => {
    const tree = await WordListsPage();
    expect(requireRole).toHaveBeenCalledWith('STUDENT');
    expect(loadWordListsIndex).toHaveBeenCalledWith('user-1');
    expect(child(tree, ListsIndex).props).toMatchObject({ view: { maxActive: 50 } });
  });

  it('nobody else gets in (requireRole redirects before any read)', async () => {
    requireRole.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(WordListsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(loadWordListsIndex).not.toHaveBeenCalled();
  });
});

describe('/words/lists/[id]', () => {
  it('one of the learner’s lists, in the learner’s UI locale, page 1 by default', async () => {
    const tree = await openList(LIST);
    expect(loadWordListPage).toHaveBeenCalledWith({
      userId: 'user-1',
      uiLocale: 'uk',
      listId: LIST,
      pageNumber: 1,
    });
    const editor = child(tree, ListEditor);
    expect(editor.props).toMatchObject({ view: VIEW, searchMinChars: 2 });
    expect(editor.key).toBe(`${LIST}:1`);
  });

  it('`?page=3` asks for page 3', async () => {
    await openList(LIST, { page: '3' });
    expect(loadWordListPage).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 3 }));
  });

  it('another learner’s, an unknown list or a page past the last: 404, never 403', async () => {
    loadWordListPage.mockResolvedValue(null);
    await expect(openList(LIST)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([
    ['a path', '../admin'],
    ['upper case', LIST.toUpperCase()],
    ['too short', 'abc'],
  ])('a malformed id (%s) is a 404 before any read', async (_, id) => {
    await expect(openList(id)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadWordListPage).not.toHaveBeenCalled();
  });

  it.each([
    ['0'],
    ['01'],
    ['2.5'],
    [['1', '2']],
  ])('`?page=%s` is a 404 before any read', async (page) => {
    await expect(openList(LIST, { page })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadWordListPage).not.toHaveBeenCalled();
  });
});
