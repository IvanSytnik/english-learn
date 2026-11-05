import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The word list actions (B6.7) over mocked queries: learners only, lists by
 * id (owner-checked in the queries — their NOT_FOUND passes through), words
 * by slug only, every write metered by the rows it wrote.
 */

const q = vi.hoisted(() => ({
  createWordList: vi.fn(),
  renameWordList: vi.fn(),
  archiveWordList: vi.fn(),
  restoreWordList: vi.fn(),
  addWordListEntries: vi.fn(),
  removeWordListEntry: vi.fn(),
  setWordListEntryNote: vi.fn(),
  moveWordListEntry: vi.fn(),
  getWordList: vi.fn(),
  listWordLists: vi.fn(),
}));
const { auth, getVocabPool, meteredLimit, withinAuthLimits, budget, getNativeLanguage } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    getVocabPool: vi.fn(),
    meteredLimit: vi.fn(),
    withinAuthLimits: vi.fn(),
    getNativeLanguage: vi.fn(),
    budget: { left: 1000, charged: [] as number[], names: [] as string[] },
  }));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/word-lists', () => q);
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState: vi.fn() }));
vi.mock('@englishlearn/db/queries/lexeme-preferences', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/auth/rate-limit', () => ({ meteredLimit, withinAuthLimits }));
vi.mock('@/lib/learner', () => ({
  vocabSessionService: {
    wordStates: async () => ({
      reviews: new Map(),
      prioritizedItemIds: new Set(),
      hiddenItemIds: new Set(),
      provenItemIds: new Set(),
    }),
  },
}));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'ru' }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const actions = await import('@/app/[locale]/(student)/actions/word-lists');
const { slugIndex } = await import('@englishlearn/db/vocab/slug');

const USER = 'user_1';
const TX = { tag: 'tx' };
const LIST = 'clist000000000000000000001';

const lex = (lemma: string, frequencyRank: number, ru = `${lemma}-ru`) => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos: 'NOUN' as const,
  sense: '',
  cefrLevel: 'A1' as const,
  conceptId: 'vocab.food_drink.a1',
  frequencyRank,
  collections: [],
  definitions: { en: `the ${lemma}` },
  translations: { ru },
  variants: [],
  examples: [],
  collocations: [],
  ipa: null,
});
const ROWS = [lex('apple', 2, 'яблоко'), lex('apricot', 9, 'абрикос'), lex('bread', 1, 'хлеб')];
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

const ok = <T>(value: T) => ({ ok: true, value });
const NF = { ok: false, error: 'NOT_FOUND' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: USER, role: 'STUDENT' } });
  getVocabPool.mockResolvedValue(poolOf(ROWS));
  getNativeLanguage.mockResolvedValue('ru');
  budget.left = 1000;
  budget.charged = [];
  budget.names = [];
  // The real rule (meteredWrite, DB-tested): charged what was written; past the budget, nothing.
  meteredLimit.mockImplementation(async (name, _subject, write) => {
    budget.names.push(name);
    const { written, value } = await write(TX);
    if (written > 0 && written > budget.left) return { ok: false };
    budget.left -= written;
    budget.charged.push(written);
    return { ok: true, value };
  });
  withinAuthLimits.mockResolvedValue(true);
  q.createWordList.mockResolvedValue(ok({ id: LIST, title: 'Trip' }));
  q.addWordListEntries.mockImplementation(async (_tx, args) =>
    ok({ added: args.lexemeIds.length, alreadyIn: 0, notFound: [], didNotFit: 0 }),
  );
  q.getWordList.mockResolvedValue(
    ok({ id: LIST, title: 'Trip', source: 'CUSTOM', archivedAt: null, entries: [] }),
  );
});

const noWrite = () => {
  for (const fn of Object.values(q)) expect(fn).not.toHaveBeenCalled();
  expect(meteredLimit).not.toHaveBeenCalled();
};

describe('only learners (S5)', () => {
  it.each([
    ['no session', null, 'UNAUTHENTICATED'],
    ['a TUTOR', { user: { id: USER, role: 'TUTOR' } }, 'FORBIDDEN'],
    ['an ADMIN', { user: { id: USER, role: 'ADMIN' } }, 'FORBIDDEN'],
  ])('%s is refused by every action, nothing read or written', async (_, session, error) => {
    auth.mockResolvedValue(session);
    const word = { listId: LIST, slug: 'apple-noun' };
    const results = await Promise.all([
      actions.createWordListAction({ title: 'x' }),
      actions.renameWordListAction({ listId: LIST, title: 'x' }),
      actions.archiveWordListAction({ listId: LIST }),
      actions.restoreWordListAction({ listId: LIST }),
      actions.addWordsToListAction({ listId: LIST, slugs: ['apple-noun'] }),
      actions.removeWordFromListAction(word),
      actions.setWordListNoteAction({ ...word, note: 'n' }),
      actions.moveWordInListAction({ ...word, anchor: { before: 'bread-noun' } }),
      actions.searchWordsAction({ query: 'ap' }),
      actions.wordListMenuAction({ slug: 'apple-noun' }),
    ]);
    for (const res of results) expect(res).toEqual({ ok: false, error });
    noWrite();
    expect(getVocabPool).not.toHaveBeenCalled();
  });
});

describe('inputs', () => {
  it.each([
    ['a list id that is no id', () => actions.archiveWordListAction({ listId: '../x' })],
    [
      'an Item or Lexeme id as a word',
      () => actions.removeWordFromListAction({ listId: LIST, slug: 'lex_apple' }),
    ],
    [
      'an extra field',
      () => actions.addWordsToListAction({ listId: LIST, slugs: ['apple-noun'], ids: [] } as never),
    ],
    ['no words', () => actions.addWordsToListAction({ listId: LIST, slugs: [] })],
    [
      'more than 20 words',
      () =>
        actions.addWordsToListAction({
          listId: LIST,
          slugs: Array.from({ length: 21 }, (_, i) => `w${i}-noun`),
        }),
    ],
    [
      'an anchor with both sides',
      () =>
        actions.moveWordInListAction({
          listId: LIST,
          slug: 'apple-noun',
          anchor: { before: 'bread-noun', after: 'bread-noun' } as never,
        }),
    ],
    ['an over-long query', () => actions.searchWordsAction({ query: 'x'.repeat(81) })],
  ])('refuses %s: INVALID, nothing written', async (_, call) => {
    expect(await call()).toEqual({ ok: false, error: 'INVALID' });
    noWrite();
  });
});

describe('writes are metered by rows written (vocab-list:user)', () => {
  it('create: the list costs 1; with a word from the menu, 2 — in one transaction', async () => {
    expect(await actions.createWordListAction({ title: 'Trip' })).toEqual(
      ok({ id: LIST, title: 'Trip', added: 0, alreadyIn: 0, notFound: 0, didNotFit: 0 }),
    );
    expect(await actions.createWordListAction({ title: 'Trip', slugs: ['apple-noun'] })).toEqual(
      ok({ id: LIST, title: 'Trip', added: 1, alreadyIn: 0, notFound: 0, didNotFit: 0 }),
    );
    expect(q.createWordList).toHaveBeenLastCalledWith(TX, {
      ownerId: USER,
      title: 'Trip',
      source: undefined,
    });
    expect(q.addWordListEntries).toHaveBeenCalledExactlyOnceWith(TX, {
      ownerId: USER,
      listId: LIST,
      lexemeIds: ['lex-apple'],
      overflow: undefined,
    });
    expect(budget.charged).toEqual([1, 2]);
    expect(budget.names).toEqual(['vocab-list:user', 'vocab-list:user']);
  });

  it('add by slug: the added count is charged; words already in the list are free', async () => {
    q.addWordListEntries.mockResolvedValueOnce(
      ok({ added: 1, alreadyIn: 1, notFound: [], didNotFit: 0 }),
    );
    expect(
      await actions.addWordsToListAction({ listId: LIST, slugs: ['apple-noun', 'bread-noun'] }),
    ).toEqual(ok({ added: 1, alreadyIn: 1, notFound: 0, didNotFit: 0 }));
    expect(q.addWordListEntries.mock.lastCall?.[1].lexemeIds).toEqual(['lex-apple', 'lex-bread']);
    expect(budget.charged).toEqual([1]);
  });

  it('an unknown slug is counted as not found, never guessed', async () => {
    expect(
      await actions.addWordsToListAction({ listId: LIST, slugs: ['pear-noun', 'apple-noun'] }),
    ).toEqual(ok({ added: 1, alreadyIn: 0, notFound: 1, didNotFit: 0 }));
  });

  it('archive and restore cost 1 when they change the list, 0 when they do not', async () => {
    q.archiveWordList.mockResolvedValueOnce(ok({ archived: true, changed: true }));
    q.archiveWordList.mockResolvedValueOnce(ok({ archived: true, changed: false }));
    q.restoreWordList.mockResolvedValueOnce(ok({ restored: true, changed: true }));
    await actions.archiveWordListAction({ listId: LIST });
    await actions.archiveWordListAction({ listId: LIST });
    await actions.restoreWordListAction({ listId: LIST });
    expect(budget.charged).toEqual([1, 0, 1]);
  });

  it('move costs 1 only when the word moved; anchors are words of the pool', async () => {
    q.moveWordListEntry.mockResolvedValueOnce(ok({ moved: true }));
    q.moveWordListEntry.mockResolvedValueOnce(ok({ moved: false }));
    const move = { listId: LIST, slug: 'apple-noun', anchor: { after: 'bread-noun' } };
    expect(await actions.moveWordInListAction(move)).toEqual(ok({ moved: true }));
    await actions.moveWordInListAction(move);
    expect(q.moveWordListEntry).toHaveBeenCalledWith(TX, {
      ownerId: USER,
      listId: LIST,
      lexemeId: 'lex-apple',
      anchor: { after: 'lex-bread' },
    });
    expect(budget.charged).toEqual([1, 0]);
    expect(
      await actions.moveWordInListAction({ ...move, anchor: { before: 'pear-noun' } }),
    ).toEqual(NF);
  });

  it('a refused write (NOT_FOUND, LIMIT) costs nothing and passes its error on', async () => {
    q.renameWordList.mockResolvedValueOnce(NF);
    q.createWordList.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    expect(await actions.renameWordListAction({ listId: LIST, title: 'x' })).toEqual(NF);
    expect(await actions.createWordListAction({ title: 'x' })).toEqual({
      ok: false,
      error: 'LIMIT',
    });
    expect(budget.charged).toEqual([0, 0]);
  });

  it('past the budget: RATE_LIMITED, nothing charged', async () => {
    budget.left = 0;
    expect(await actions.addWordsToListAction({ listId: LIST, slugs: ['apple-noun'] })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    });
    expect(budget.charged).toEqual([]);
  });

  it('a failing write is UNAVAILABLE, logged on the server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    q.setWordListEntryNote.mockRejectedValueOnce(new Error('db down'));
    expect(
      await actions.setWordListNoteAction({ listId: LIST, slug: 'apple-noun', note: 'n' }),
    ).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(log).toHaveBeenCalledWith('setWordListNote failed', expect.any(Error));
    log.mockRestore();
  });
});

describe('searchWordsAction', () => {
  it('PUBLISHED pool words by prefix or gloss, marked when already in the list; no ids', async () => {
    q.getWordList.mockResolvedValueOnce(
      ok({
        id: LIST,
        title: 'Trip',
        source: 'CUSTOM',
        archivedAt: null,
        entries: [{ lexemeId: 'lex-apple', position: 0, note: null }],
      }),
    );
    const res = await actions.searchWordsAction({ query: 'ap', listId: LIST });
    expect(res).toEqual(
      ok({
        results: [
          {
            slug: 'apple-noun',
            headword: 'apple',
            pos: 'NOUN',
            level: 'A1',
            gloss: 'яблоко',
            inList: true,
          },
          expect.objectContaining({ slug: 'apricot-noun', inList: false }),
        ],
      }),
    );
    expect(JSON.stringify(res)).not.toMatch(/item-|lex-|itemId|lexemeId/);
    expect(q.getWordList).toHaveBeenCalledWith({ tag: 'prisma' }, { ownerId: USER, listId: LIST });
    expect(await actions.searchWordsAction({ query: 'хле' })).toEqual(
      ok({ results: [expect.objectContaining({ slug: 'bread-noun', inList: false })] }),
    );
  });

  it('another learner’s list is NOT_FOUND', async () => {
    q.getWordList.mockResolvedValueOnce(NF);
    expect(await actions.searchWordsAction({ query: 'ap', listId: LIST })).toEqual(NF);
  });

  it('each query is one of `vocab-search:user`; past the budget it is RATE_LIMITED, nothing read', async () => {
    await actions.searchWordsAction({ query: 'ap' });
    expect(withinAuthLimits).toHaveBeenCalledWith([['vocab-search:user', USER]]);
    withinAuthLimits.mockResolvedValueOnce(false);
    getVocabPool.mockClear();
    q.getWordList.mockClear();
    expect(await actions.searchWordsAction({ query: 'ap', listId: LIST })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    });
    expect(getVocabPool).not.toHaveBeenCalled();
    expect(q.getWordList).not.toHaveBeenCalled();
  });
});

describe('wordListMenuAction', () => {
  it('the learner’s active lists, marked when they hold the word; no lexeme ids', async () => {
    q.listWordLists.mockResolvedValueOnce([
      {
        id: 'a',
        title: 'A',
        source: 'CUSTOM',
        updatedAt: new Date(),
        archivedAt: null,
        lexemeIds: ['lex-apple'],
      },
      {
        id: 'b',
        title: 'B',
        source: 'CUSTOM',
        updatedAt: new Date(),
        archivedAt: null,
        lexemeIds: [],
      },
      {
        id: 'c',
        title: 'C',
        source: 'CUSTOM',
        updatedAt: new Date(),
        archivedAt: new Date(),
        lexemeIds: [],
      },
    ]);
    const res = await actions.wordListMenuAction({ slug: 'apple-noun' });
    expect(res).toEqual(
      ok({
        lists: [
          { id: 'a', title: 'A', count: 1, hasWord: true },
          { id: 'b', title: 'B', count: 0, hasWord: false },
        ],
        atLimit: false,
      }),
    );
    expect(JSON.stringify(res)).not.toMatch(/lex-|item-/);
    expect(await actions.wordListMenuAction({ slug: 'pear-noun' })).toEqual(NF);
  });
});
