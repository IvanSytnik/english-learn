import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auth,
  wordStates,
  getVocabPool,
  setLexemePreferences,
  clearLexemePreferences,
  withinAuthLimits,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  wordStates: vi.fn(),
  getVocabPool: vi.fn(),
  setLexemePreferences: vi.fn(),
  clearLexemePreferences: vi.fn(),
  withinAuthLimits: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage: vi.fn() }));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState: vi.fn() }));
vi.mock('@englishlearn/db/queries/lexeme-preferences', () => ({
  setLexemePreferences,
  clearLexemePreferences,
}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/auth/rate-limit', () => ({ withinAuthLimits }));
vi.mock('@/lib/learner', () => ({ vocabSessionService: { wordStates } }));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const { prioritizeLevelAction, setWordPreferenceAction } = await import(
  '@/app/[locale]/(student)/actions/vocab-preferences'
);
const { slugIndex } = await import('@englishlearn/db/vocab/slug');

const USER = 'user_1';
const lex = (lemma: string, level: 'A1' | 'A2', frequencyRank: number, topic = 'food_drink') => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos: 'NOUN' as const,
  sense: '',
  cefrLevel: level,
  conceptId: `vocab.${topic}.${level.toLowerCase()}`,
  frequencyRank,
  collections: topic === 'food_drink' ? [] : ['clothes'],
  definitions: { en: lemma },
  translations: {},
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
const ROWS = [
  lex('apple', 'A1', 1),
  lex('bread', 'A1', 2),
  lex('cake', 'A1', 3),
  lex('dates', 'A1', 4),
  lex('eggs', 'A1', 5),
  lex('soup', 'A2', 6),
  lex('shirt', 'A1', 7, 'travel'),
];
const started = { dueAt: 1n, cardStatus: 'LEARNING', stability: 1, lastReviewAt: 0n, lapses: 0 };
const states = (
  over: Partial<{ reviews: [string, unknown][]; p: string[]; h: string[] }> = {},
) => ({
  reviews: new Map(over.reviews ?? []),
  prioritizedItemIds: new Set(over.p ?? []),
  hiddenItemIds: new Set(over.h ?? []),
  provenItemIds: new Set<string>(),
});
const FOOD_A1 = { page: { kind: 'topic', topic: 'food_drink' }, level: 'A1' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: USER, role: 'STUDENT' } });
  getVocabPool.mockResolvedValue(poolOf(ROWS));
  wordStates.mockResolvedValue(states());
  withinAuthLimits.mockResolvedValue(true);
  setLexemePreferences.mockImplementation(async (_db, args) => ({
    changed: args.lexemeIds.length,
    notFound: [],
  }));
  clearLexemePreferences.mockResolvedValue({ cleared: 1 });
});

const nothingWritten = () => {
  expect(setLexemePreferences).not.toHaveBeenCalled();
  expect(clearLexemePreferences).not.toHaveBeenCalled();
  expect(withinAuthLimits).not.toHaveBeenCalled();
};

describe('only learners (S5)', () => {
  it.each([
    ['no session', null, 'UNAUTHENTICATED'],
    ['a TUTOR', { user: { id: USER, role: 'TUTOR' } }, 'FORBIDDEN'],
    ['an ADMIN', { user: { id: USER, role: 'ADMIN' } }, 'FORBIDDEN'],
  ])('%s is refused by every action, nothing read or written', async (_, session, error) => {
    auth.mockResolvedValue(session);
    expect(await setWordPreferenceAction({ slug: 'apple-noun', change: 'hide' })).toEqual({
      ok: false,
      error,
    });
    expect(await prioritizeLevelAction(FOOD_A1)).toEqual({ ok: false, error });
    expect(getVocabPool).not.toHaveBeenCalled();
    expect(wordStates).not.toHaveBeenCalled();
    nothingWritten();
  });
});

describe('setWordPreferenceAction', () => {
  it.each([
    ['prioritize', 'PRIORITIZED'],
    ['hide', 'HIDDEN'],
  ] as const)('%s writes %s for the slug’s lexeme, one hit of the budget', async (change, state) => {
    expect(await setWordPreferenceAction({ slug: 'bread-noun', change })).toEqual({
      ok: true,
      value: { preference: state },
    });
    expect(setLexemePreferences).toHaveBeenCalledExactlyOnceWith(
      { tag: 'prisma' },
      { userId: USER, lexemeIds: ['lex-bread'], state },
    );
    expect(withinAuthLimits).toHaveBeenCalledExactlyOnceWith([['vocab-pref:user', USER]]);
  });

  it.each([
    ['unprioritize', 'PRIORITIZED'],
    ['unhide', 'HIDDEN'],
  ] as const)('%s clears only %s', async (change, state) => {
    expect(await setWordPreferenceAction({ slug: 'bread-noun', change })).toEqual({
      ok: true,
      value: { preference: null },
    });
    expect(clearLexemePreferences).toHaveBeenCalledExactlyOnceWith(
      { tag: 'prisma' },
      { userId: USER, lexemeIds: ['lex-bread'], state },
    );
    expect(setLexemePreferences).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown slug', 'pear-noun'],
    ['an Item id (no id is an address)', 'item-apple'],
    ['a Lexeme id', 'lex-apple'],
  ])('%s is NOT_FOUND and costs nothing', async (_, slug) => {
    expect(await setWordPreferenceAction({ slug, change: 'hide' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    nothingWritten();
  });

  it('a word unpublished since the pool was read is NOT_FOUND (the write re-checks PUBLISHED)', async () => {
    setLexemePreferences.mockResolvedValueOnce({ changed: 0, notFound: ['lex-bread'] });
    expect(await setWordPreferenceAction({ slug: 'bread-noun', change: 'prioritize' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('over the hourly budget: RATE_LIMITED, nothing written', async () => {
    withinAuthLimits.mockResolvedValueOnce(false);
    expect(await setWordPreferenceAction({ slug: 'bread-noun', change: 'hide' })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    });
    expect(setLexemePreferences).not.toHaveBeenCalled();
  });

  it.each([
    ['no slug', { change: 'hide' }],
    ['an upper-case slug', { slug: 'Bread-noun', change: 'hide' }],
    ['an unknown change', { slug: 'bread-noun', change: 'delete' }],
    ['an extra field', { slug: 'bread-noun', change: 'hide', lexemeId: 'lex-bread' }],
  ])('refuses %s', async (_, input) => {
    expect(await setWordPreferenceAction(input as never)).toEqual({ ok: false, error: 'INVALID' });
    expect(getVocabPool).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('a failing write is UNAVAILABLE, logged on the server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLexemePreferences.mockRejectedValueOnce(new Error('db down'));
    expect(await setWordPreferenceAction({ slug: 'bread-noun', change: 'hide' })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    expect(log).toHaveBeenCalledWith('setWordPreference failed', expect.any(Error));
    log.mockRestore();
  });
});

describe('prioritizeLevelAction', () => {
  it('prioritizes the level’s new words in page order, skipping started, hidden and prioritized ones', async () => {
    wordStates.mockResolvedValue(
      states({ reviews: [['item-apple', started]], p: ['item-bread'], h: ['item-cake'] }),
    );
    expect(await prioritizeLevelAction(FOOD_A1)).toEqual({
      ok: true,
      value: { prioritized: 2, remaining: 0, slugs: ['dates-noun', 'eggs-noun'] },
    });
    expect(setLexemePreferences).toHaveBeenCalledExactlyOnceWith(
      { tag: 'prisma' },
      { userId: USER, lexemeIds: ['lex-dates', 'lex-eggs'], state: 'PRIORITIZED' },
    );
    // n words cost n.
    expect(withinAuthLimits).toHaveBeenCalledExactlyOnceWith([['vocab-pref:user', USER, 2]]);
  });

  it('a collection page’s level: only its tagged words', async () => {
    await prioritizeLevelAction({ page: { kind: 'collection', key: 'clothes' }, level: 'A1' });
    expect(setLexemePreferences.mock.lastCall?.[1].lexemeIds).toEqual(['lex-shirt']);
  });

  it('at most 200 per call, in page order; remaining says what a next call would take', async () => {
    const many = Array.from({ length: 230 }, (_, i) =>
      lex(`w${String(i).padStart(3, '0')}`, 'A1', i),
    );
    getVocabPool.mockResolvedValue(poolOf(many));
    expect(await prioritizeLevelAction(FOOD_A1)).toEqual({
      ok: true,
      value: expect.objectContaining({ prioritized: 200, remaining: 30 }),
    });
    const ids = setLexemePreferences.mock.lastCall?.[1].lexemeIds;
    expect(ids).toHaveLength(200);
    expect([ids[0], ids[199]]).toEqual(['lex-w000', 'lex-w199']);
    expect(withinAuthLimits).toHaveBeenCalledWith([['vocab-pref:user', USER, 200]]);
  });

  it('nothing left to prioritize costs nothing', async () => {
    wordStates.mockResolvedValue(states({ p: ['item-soup'] }));
    expect(
      await prioritizeLevelAction({ page: { kind: 'topic', topic: 'food_drink' }, level: 'A2' }),
    ).toEqual({ ok: true, value: { prioritized: 0, remaining: 0, slugs: [] } });
    nothingWritten();
  });

  it('over the budget: RATE_LIMITED, all or nothing', async () => {
    withinAuthLimits.mockResolvedValueOnce(false);
    expect(await prioritizeLevelAction(FOOD_A1)).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(setLexemePreferences).not.toHaveBeenCalled();
  });

  it.each([
    ['a topic outside the taxonomy', { page: { kind: 'topic', topic: 'cooking' }, level: 'A1' }],
    [
      'a collection outside the allowlist',
      { page: { kind: 'collection', key: 'food_drink' }, level: 'A1' },
    ],
    ['an unknown level', { ...FOOD_A1, level: 'Z1' }],
    ['a list page', { page: { kind: 'list', listId: 'l1' }, level: 'A1' }],
    ['explicit word ids', { ...FOOD_A1, lexemeIds: ['lex-apple'] }],
  ])('refuses %s', async (_, input) => {
    expect(await prioritizeLevelAction(input as never)).toEqual({ ok: false, error: 'INVALID' });
    expect(wordStates).not.toHaveBeenCalled();
    nothingWritten();
  });
});
