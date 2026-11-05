import { beforeEach, describe, expect, it, vi } from 'vitest';

const { wordStates, getVocabPool, getNativeLanguage } = vi.hoisted(() => ({
  wordStates: vi.fn(),
  getVocabPool: vi.fn(),
  getNativeLanguage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState: vi.fn() }));
vi.mock('@englishlearn/db/queries/lexeme-preferences', () => ({
  setLexemePreferences: vi.fn(),
  clearLexemePreferences: vi.fn(),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ withinAuthLimits: vi.fn() }));
vi.mock('@/lib/learner', () => ({ vocabSessionService: { wordStates } }));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { slugIndex } = await import('@englishlearn/db/vocab/slug');
const { loadWordsPage, wordBadge, WORDS_PAGE_SIZE } = await import('@/lib/vocab-words');

type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
const lex = (
  lemma: string,
  level: Level,
  frequencyRank: number | null,
  over: Partial<{ topic: string; collections: string[]; pos: 'NOUN' | 'VERB'; sense: string }> = {},
) => ({
  itemId: `item-${lemma}-${over.pos ?? 'NOUN'}`,
  id: `lex-${lemma}-${over.pos ?? 'NOUN'}`,
  lemma,
  lemmaKey: lemma,
  pos: over.pos ?? 'NOUN',
  sense: over.sense ?? '',
  cefrLevel: level,
  conceptId: `vocab.${over.topic ?? 'food_drink'}.${level.toLowerCase()}`,
  frequencyRank,
  collections: over.collections ?? [],
  ipa: null,
  definitions: { en: `the ${lemma}` },
  translations: { ru: `${lemma}-ru`, uk: `${lemma}-uk` },
  examples: [],
  collocations: [],
  variants: [],
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

const review = (cardStatus: string, stability: number) => ({
  dueAt: 1n,
  cardStatus,
  stability,
  lastReviewAt: 0n,
});
const states = (
  reviews: Record<string, ReturnType<typeof review>> = {},
  prioritized: string[] = [],
  hidden: string[] = [],
) => ({
  reviews: new Map(Object.entries(reviews)),
  prioritizedItemIds: new Set(prioritized),
  hiddenItemIds: new Set(hidden),
});

const FOOD = [
  lex('soup', 'A2', 40),
  lex('bread', 'A1', 20, { collections: ['clothes'] }),
  lex('apple', 'A1', 10),
  lex('rare', 'A1', null),
  lex('cake', 'A1', 20),
  lex('march', 'A1', 30, { topic: 'travel' }),
  // Last by spelling, first by frequency: the order is frequency's.
  lex('zest', 'A1', 5),
  lex('jam', 'B1', 50, { collections: ['food_drink'] }),
];

const load = (page: object, pageNumber = 1) =>
  loadWordsPage({ userId: 'u1', uiLocale: 'en', page: page as never, pageNumber });

beforeEach(() => {
  vi.clearAllMocks();
  getVocabPool.mockResolvedValue(poolOf(FOOD));
  getNativeLanguage.mockResolvedValue('uk');
  wordStates.mockResolvedValue(states());
});

describe('wordBadge: four badges, from the session’s own stage', () => {
  it.each([
    ['never answered', null, 'notStarted'],
    ['a NEW card', review('NEW', 0), 'notStarted'],
    ['in learning steps', review('LEARNING', 0.5), 'learning'],
    ['on a recognition rung', review('REVIEW', 5), 'learning'],
    ['on the cloze rung', review('REVIEW', 12), 'reviewing'],
    ['on cued recall', review('REVIEW', 40), 'known'],
    ['on full recall', review('REVIEW', 400), 'known'],
  ])('%s → %s', (_, r, badge) => {
    expect(wordBadge(r as never)).toBe(badge);
  });
});

describe('loadWordsPage', () => {
  it('a topic page: its words only, grouped by level, frequent first, unknown frequency last', async () => {
    const view = await load({ kind: 'topic', topic: 'food_drink' });
    expect(view?.title).toBe('Food and drink');
    expect(view?.groups.map((g) => [g.level, g.words.map((w) => w.headword)])).toEqual([
      ['A1', ['zest', 'apple', 'bread', 'cake', 'rare']],
      ['A2', ['soup']],
      ['B1', ['jam']],
    ]);
    expect(view).toMatchObject({ total: 7, page: 1, pageCount: 1 });
    expect(view?.groups[0]?.practice).toEqual({ concept: 'vocab.food_drink.a1' });
  });

  it('a row: slug, headword, POS, level, gloss in the learner’s language, badge, preference', async () => {
    wordStates.mockResolvedValue(
      states({ 'item-apple-NOUN': review('REVIEW', 12) }, ['item-bread-NOUN'], ['item-cake-NOUN']),
    );
    const view = await load({ kind: 'topic', topic: 'food_drink' });
    expect(view?.groups[0]?.words.slice(1, 4)).toEqual([
      {
        slug: 'apple-noun',
        headword: 'apple',
        pos: 'NOUN',
        level: 'A1',
        gloss: 'apple-uk',
        badge: 'reviewing',
        preference: null,
      },
      expect.objectContaining({
        slug: 'bread-noun',
        badge: 'notStarted',
        preference: 'PRIORITIZED',
      }),
      expect.objectContaining({ slug: 'cake-noun', preference: 'HIDDEN' }),
    ]);
  });

  it('no Item or Lexeme id reaches the page (Axiom 3)', async () => {
    const json = JSON.stringify(await load({ kind: 'topic', topic: 'food_drink' }));
    expect(json).not.toMatch(/item-|lex-|itemId|lexemeId/);
  });

  it('without a native language the gloss follows the interface; English falls back to the definition', async () => {
    getNativeLanguage.mockResolvedValue(null);
    const view = await load({ kind: 'topic', topic: 'food_drink' });
    expect(view?.groups[0]?.words[1]?.gloss).toBe('the apple');
  });

  it('a collection page: words tagged with the key, across topics; practised in the collection', async () => {
    const view = await load({ kind: 'collection', key: 'clothes' });
    expect(view?.title).toBe('Clothes');
    expect(view?.groups.flatMap((g) => g.words.map((w) => w.slug))).toEqual(['bread-noun']);
    expect(view?.groups[0]?.practice).toEqual({ collection: 'clothes' });
  });

  it('prioritizable counts the whole level: not started, neither hidden nor prioritized', async () => {
    wordStates.mockResolvedValue(
      states({ 'item-apple-NOUN': review('LEARNING', 1) }, ['item-bread-NOUN'], ['item-cake-NOUN']),
    );
    const view = await load({ kind: 'topic', topic: 'food_drink' });
    expect(view?.groups.map((g) => [g.level, g.prioritizable])).toEqual([
      ['A1', 2],
      ['A2', 1],
      ['B1', 1],
    ]);
  });

  describe(`pagination (${WORDS_PAGE_SIZE} a page)`, () => {
    const many = Array.from({ length: 230 }, (_, i) =>
      lex(`w${String(i).padStart(3, '0')}`, i < 150 ? 'A1' : 'A2', i + 1, { topic: 'travel' }),
    );

    it('stable pages: 100, 100, 30; a level split across pages keeps its whole-level count', async () => {
      getVocabPool.mockResolvedValue(poolOf(many));
      const pages = await Promise.all(
        [1, 2, 3].map((n) => load({ kind: 'topic', topic: 'travel' }, n)),
      );
      expect(pages.map((p) => p?.groups.flatMap((g) => g.words).length)).toEqual([100, 100, 30]);
      expect(pages.map((p) => p?.pageCount)).toEqual([3, 3, 3]);
      expect(pages[1]?.groups.map((g) => [g.level, g.words.length, g.prioritizable])).toEqual([
        ['A1', 50, 150],
        ['A2', 50, 80],
      ]);
      expect(pages[0]?.groups[0]?.words[0]?.slug).toBe('w000-noun');
      expect(pages[2]?.groups[0]?.words.at(-1)?.slug).toBe('w229-noun');
    });

    it.each([0, 4, 1.5, -1])('page %s is out of range: null (404)', async (n) => {
      getVocabPool.mockResolvedValue(poolOf(many));
      expect(await load({ kind: 'topic', topic: 'travel' }, n)).toBeNull();
    });
  });

  it('an empty topic is one empty page', async () => {
    expect(await load({ kind: 'topic', topic: 'weather' })).toMatchObject({
      total: 0,
      pageCount: 1,
      groups: [],
    });
  });

  it('an ambiguous slug is left out of the page (it could not be acted on)', async () => {
    getVocabPool.mockResolvedValue(
      poolOf([
        lex('look', 'A1', 1, { sense: 'see' }),
        { ...lex('look', 'A1', 2, { sense: 'see' }), itemId: 'item-dup', id: 'lex-dup' },
        lex('milk', 'A1', 3),
      ]),
    );
    const view = await load({ kind: 'topic', topic: 'food_drink' });
    expect(view?.groups.flatMap((g) => g.words.map((w) => w.slug))).toEqual(['milk-noun']);
  });
});
