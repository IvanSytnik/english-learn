import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The lists index and a list's page (B6.7) over mocked reads. */

const {
  getWordList,
  listWordLists,
  getUnpublishedWordListEntries,
  removeWordListEntry,
  meteredLimit,
  getVocabPool,
  wordStates,
  getNativeLanguage,
} = vi.hoisted(() => ({
  getWordList: vi.fn(),
  listWordLists: vi.fn(),
  getUnpublishedWordListEntries: vi.fn(),
  removeWordListEntry: vi.fn(),
  meteredLimit: vi.fn(),
  getVocabPool: vi.fn(),
  wordStates: vi.fn(),
  getNativeLanguage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/word-lists', () => ({
  getWordList,
  listWordLists,
  getUnpublishedWordListEntries,
  removeWordListEntry,
}));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState: vi.fn() }));
vi.mock('@englishlearn/db/queries/lexeme-preferences', () => ({}));
vi.mock('@/lib/auth/rate-limit', () => ({
  meteredLimit,
  withinAuthLimits: vi.fn(async () => true),
}));
vi.mock('@/lib/learner', () => ({ vocabSessionService: { wordStates } }));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { listMenu, loadWordListPage, loadWordListsIndex, removeWord, LIST_PAGE_SIZE } = await import(
  '@/lib/word-lists'
);
const { previewImport } = await import('@/lib/vocab-import');
const { slugIndex } = await import('@englishlearn/db/vocab/slug');

const USER = 'user_1';
const lex = (lemma: string) => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos: 'NOUN' as const,
  sense: '',
  cefrLevel: 'A2' as const,
  conceptId: 'vocab.food_drink.a2',
  frequencyRank: null,
  collections: [],
  definitions: { en: `the ${lemma}` },
  translations: { ru: `${lemma}-ru` },
  variants: [],
  examples: [],
  collocations: [],
  ipa: null,
});
function poolOf(rows: ReturnType<typeof lex>[]) {
  const { bySlug } = slugIndex(rows);
  return {
    lexemes: rows,
    byItemId: new Map(rows.map((r) => [r.itemId, r])),
    itemIdByLexemeId: new Map(rows.map((r) => [r.id, r.itemId])),
    bySlug,
    slugByItemId: new Map([...bySlug].map(([slug, r]) => [r.itemId, slug])),
  };
}
const review = (stability: number) => ({
  dueAt: 1n,
  cardStatus: 'REVIEW',
  stability,
  lastReviewAt: 0n,
  lapses: 0,
});

const WORDS = Array.from({ length: 230 }, (_, i) => lex(`w${String(i).padStart(3, '0')}`));
const at = new Date('2026-11-05T10:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  getVocabPool.mockResolvedValue(poolOf(WORDS));
  getNativeLanguage.mockResolvedValue('ru');
  wordStates.mockResolvedValue({
    reviews: new Map([
      ['item-w000', review(3)],
      ['item-w001', review(30)],
      ['item-w002', review(90)],
    ]),
    prioritizedItemIds: new Set(),
    hiddenItemIds: new Set(),
    provenItemIds: new Set(['item-w003']),
  });
});

describe('loadWordListsIndex', () => {
  it('active lists first with counts and V2-16 stages; archived apart; no ids of words', async () => {
    listWordLists.mockResolvedValue([
      {
        id: 'l1',
        title: 'Food',
        source: 'CUSTOM',
        updatedAt: at,
        archivedAt: null,
        // w003 is proven but never reviewed in this fixture: not started.
        lexemeIds: ['lex-w000', 'lex-w001', 'lex-w002', 'lex-w004', 'lex-gone'],
      },
      { id: 'l2', title: 'Old', source: 'IMPORT', updatedAt: at, archivedAt: at, lexemeIds: [] },
    ]);
    const view = await loadWordListsIndex(USER);
    expect(view).toEqual({
      maxActive: 50,
      active: [
        {
          id: 'l1',
          title: 'Food',
          count: 4,
          updatedAt: at.toISOString(),
          archivedAt: null,
          stages: { not_started: 1, learning: 1, reviewing: 1, known: 1 },
        },
      ],
      archived: [expect.objectContaining({ id: 'l2', count: 0, archivedAt: at.toISOString() })],
    });
    expect(JSON.stringify(view)).not.toMatch(/lex-|item-/);
  });

  it('no lists: no pool or state read at all', async () => {
    listWordLists.mockResolvedValue([]);
    expect(await loadWordListsIndex(USER)).toEqual({ active: [], archived: [], maxActive: 50 });
    expect(getVocabPool).not.toHaveBeenCalled();
    expect(wordStates).not.toHaveBeenCalled();
  });
});

describe('loadWordListPage', () => {
  const list = (lexemeIds: string[], archivedAt: Date | null = null) => ({
    ok: true,
    value: {
      id: 'l1',
      title: 'Big',
      source: 'IMPORT',
      archivedAt,
      entries: lexemeIds.map((lexemeId, position) => ({
        lexemeId,
        position,
        note: lexemeId === 'lex-w001' ? 'my note' : null,
      })),
    },
  });
  const load = (pageNumber: number) =>
    loadWordListPage({ userId: USER, uiLocale: 'en', listId: 'l1', pageNumber });

  it('a page of ≤ 100 rows in list order, with notes, badges and the gloss of the learner', async () => {
    getWordList.mockResolvedValue(list([...WORDS.map((w) => w.id), 'lex-gone']));
    const view = await load(1);
    expect(view).toMatchObject({
      id: 'l1',
      title: 'Big',
      archived: false,
      glossLang: 'ru',
      total: 230,
      page: 1,
      pageCount: 3,
      offset: 0,
      prevSlug: null,
      nextSlug: 'w100-noun',
      unavailable: 1,
      capacity: 500,
    });
    expect(view?.rows).toHaveLength(LIST_PAGE_SIZE);
    expect(view?.rows.slice(0, 2)).toEqual([
      {
        slug: 'w000-noun',
        headword: 'w000',
        pos: 'NOUN',
        level: 'A2',
        gloss: 'w000-ru',
        badge: 'learning',
        note: null,
      },
      expect.objectContaining({ slug: 'w001-noun', badge: 'reviewing', note: 'my note' }),
    ]);
    expect(JSON.stringify(view)).not.toMatch(/lex-|item-|itemId|lexemeId/);
    expect(getWordList).toHaveBeenCalledWith({ tag: 'prisma' }, { ownerId: USER, listId: 'l1' });
  });

  it('the last page knows the word before it; past the last page is null (404)', async () => {
    getWordList.mockResolvedValue(list(WORDS.map((w) => w.id)));
    const last = await load(3);
    expect(last).toMatchObject({ page: 3, offset: 200, prevSlug: 'w199-noun', nextSlug: null });
    expect(last?.rows.map((r) => r.slug)).toHaveLength(30);
    expect(await load(4)).toBeNull();
    expect(await load(0)).toBeNull();
  });

  it('another learner’s or an unknown list is null (404); an empty list is one empty page', async () => {
    getWordList.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });
    expect(await load(1)).toBeNull();
    getWordList.mockResolvedValueOnce(list([]));
    expect(await load(1)).toMatchObject({ total: 0, pageCount: 1, rows: [] });
  });

  it('an archived list is shown read-only', async () => {
    getWordList.mockResolvedValue(list(['lex-w000'], at));
    expect(await load(1)).toMatchObject({ archived: true, total: 1 });
  });
});

/**
 * A word unpublished after it was added (`lex-gone`: in the list, not in the
 * pool): never shown, never counted — and never in the way.
 */
describe('a list holding a word that is no longer published', () => {
  const TX = { tag: 'tx' };
  const GONE = { lexemeId: 'lex-gone', lemmaKey: 'gone', pos: 'VERB' as const, sense: 'leave' };
  const entries = ['lex-w000', 'lex-gone', 'lex-w001'];

  beforeEach(() => {
    // The metered write as it is: runs the write, reports its value.
    meteredLimit.mockImplementation(async (_name, _subject, write) => ({
      ok: true,
      value: (await write(TX)).value,
    }));
    removeWordListEntry.mockResolvedValue({ ok: true, value: { removed: true } });
    getUnpublishedWordListEntries.mockResolvedValue([GONE]);
  });

  it('removeWord removes it by its slug although the pool does not know the slug', async () => {
    expect(await removeWord({ userId: USER, listId: 'l1', slug: 'gone-verb-leave' })).toEqual({
      ok: true,
      value: { removed: true },
    });
    expect(getUnpublishedWordListEntries).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { ownerId: USER, listId: 'l1' },
    );
    expect(removeWordListEntry).toHaveBeenCalledWith(TX, {
      ownerId: USER,
      listId: 'l1',
      lexemeId: 'lex-gone',
    });
  });

  it('a published word is removed straight from the pool, without the extra read', async () => {
    expect(await removeWord({ userId: USER, listId: 'l1', slug: 'w000-noun' })).toMatchObject({
      ok: true,
    });
    expect(getUnpublishedWordListEntries).not.toHaveBeenCalled();
    expect(removeWordListEntry).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ lexemeId: 'lex-w000' }),
    );
  });

  it('a slug that is neither published nor an entry of this list is NOT_FOUND, nothing written', async () => {
    expect(await removeWord({ userId: USER, listId: 'l1', slug: 'other-noun' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    // Two unpublished entries sharing a slug name neither.
    getUnpublishedWordListEntries.mockResolvedValue([GONE, { ...GONE, lexemeId: 'lex-gone-2' }]);
    expect(await removeWord({ userId: USER, listId: 'l1', slug: 'gone-verb-leave' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(removeWordListEntry).not.toHaveBeenCalled();
    expect(meteredLimit).not.toHaveBeenCalled();
  });

  it('the menu, the card and the page count the same visible words', async () => {
    const summary = {
      id: 'l1',
      title: 'Food',
      source: 'CUSTOM',
      updatedAt: at,
      archivedAt: null,
      lexemeIds: entries,
    };
    listWordLists.mockResolvedValue([summary]);
    getWordList.mockResolvedValue({
      ok: true,
      value: {
        id: 'l1',
        title: 'Food',
        source: 'CUSTOM',
        archivedAt: null,
        entries: entries.map((lexemeId, position) => ({ lexemeId, position, note: null })),
      },
    });
    const menu = await listMenu({ userId: USER, slug: 'w000-noun' });
    const index = await loadWordListsIndex(USER);
    const page = await loadWordListPage({
      userId: USER,
      uiLocale: 'en',
      listId: 'l1',
      pageNumber: 1,
    });
    expect(menu).toMatchObject({ ok: true, value: { lists: [{ count: 2, hasWord: true }] } });
    expect(index.active[0]?.count).toBe(2);
    expect(page).toMatchObject({ total: 2, unavailable: 1, capacity: 500 });
    expect(page?.rows.map((r) => r.slug)).toEqual(['w000-noun', 'w001-noun']);
  });

  it('paste preview: the room left is counted without it', async () => {
    getWordList.mockResolvedValue({
      ok: true,
      value: {
        id: 'l1',
        title: 'Food',
        source: 'CUSTOM',
        archivedAt: null,
        entries: entries.map((lexemeId, position) => ({ lexemeId, position, note: null })),
      },
    });
    const res = await previewImport({ userId: USER, uiLocale: 'en', text: 'w005', listId: 'l1' });
    expect(res).toMatchObject({ ok: true, value: { capacityLeft: 498 } });
  });
});
