import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireRole, loadWordsPage, notFound } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadWordsPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'ru' }));
vi.mock('@/lib/authz', () => ({ requireRole }));
vi.mock('@/lib/vocab-words', async () => {
  const { z } = await import('zod');
  const { VocabCollectionValue } = await import('@englishlearn/db/vocab/collections');
  const { VOCAB_TOPIC_IDS } = await import('@englishlearn/db/vocab/topics');
  return {
    loadWordsPage,
    WordsPageSchema: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('topic'), topic: z.enum(VOCAB_TOPIC_IDS) }).strict(),
      z.object({ kind: z.literal('collection'), key: VocabCollectionValue }).strict(),
    ]),
  };
});
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/app/[locale]/(student)/words/_browse/words-browser', () => ({
  WordsBrowser: () => null,
}));

const { default: TopicWordsPage } = await import(
  '@/app/[locale]/(student)/words/topics/[topic]/page'
);
const { default: CollectionWordsPage } = await import(
  '@/app/[locale]/(student)/words/collections/[key]/page'
);
const { WordsBrowser } = await import('@/app/[locale]/(student)/words/_browse/words-browser');

const VIEW = { title: 'x', glossLang: 'ru', total: 0, page: 1, pageCount: 1, groups: [] };
type Params = Record<string, string | string[] | undefined>;
const topic = (t: string, searchParams: Params = {}) =>
  TopicWordsPage({
    params: Promise.resolve({ topic: t }),
    searchParams: Promise.resolve(searchParams),
  });
const collection = (key: string, searchParams: Params = {}) =>
  CollectionWordsPage({
    params: Promise.resolve({ key }),
    searchParams: Promise.resolve(searchParams),
  });

/** The rendered tree: the page component, then the shared WordsBrowsePage's fragment. */
async function browserProps(page: Promise<React.ReactElement>) {
  const outer = await page;
  const inner = await (outer.type as (p: unknown) => Promise<React.ReactElement>)(outer.props);
  const children = (inner.props as { children: React.ReactElement[] }).children;
  const browser = children.find((c) => c.type === WordsBrowser) as React.ReactElement;
  return { props: browser.props, key: browser.key };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: 'user-1', role: 'STUDENT' });
  loadWordsPage.mockResolvedValue(VIEW);
});

describe('word pages (B6.6)', () => {
  it('a topic page: learners only, loaded for the learner in the UI locale', async () => {
    const { props, key } = await browserProps(topic('food_drink'));
    expect(requireRole).toHaveBeenCalledWith('STUDENT');
    expect(loadWordsPage).toHaveBeenCalledWith({
      userId: 'user-1',
      uiLocale: 'ru',
      page: { kind: 'topic', topic: 'food_drink' },
      pageNumber: 1,
    });
    expect(props).toEqual({ page: { kind: 'topic', topic: 'food_drink' }, view: VIEW });
    expect(key).toBe('1');
  });

  it('a curated collection, page 2', async () => {
    await browserProps(collection('clothes', { page: '2' }));
    expect(loadWordsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: { kind: 'collection', key: 'clothes' }, pageNumber: 2 }),
    );
  });

  it('not a learner: requireRole answers 404 before anything is read', async () => {
    requireRole.mockImplementation(() => notFound());
    await expect(browserProps(topic('food_drink'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadWordsPage).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown topic', () => topic('cooking')],
    ['a collection outside the allowlist', () => collection('food_drink')],
    ['a CEFR-J tag that is not curated', () => collection('collocation')],
    ['page 0', () => topic('food_drink', { page: '0' })],
    ['page 01', () => topic('food_drink', { page: '01' })],
    ['page 2.5', () => topic('food_drink', { page: '2.5' })],
    ['a repeated page', () => topic('food_drink', { page: ['1', '2'] })],
    ['a huge page', () => topic('food_drink', { page: '99999' })],
  ])('%s is a 404, nothing loaded', async (_, open) => {
    await expect(browserProps(open())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadWordsPage).not.toHaveBeenCalled();
  });

  it('a page past the last one is a 404', async () => {
    loadWordsPage.mockResolvedValue(null);
    await expect(browserProps(topic('food_drink', { page: '7' }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
