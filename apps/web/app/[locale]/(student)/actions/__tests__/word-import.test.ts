import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Paste import actions (B6.7) over mocked reads and writes; V2-17 leak checks. */

const q = vi.hoisted(() => ({
  createWordList: vi.fn(),
  addWordListEntries: vi.fn(),
  getWordList: vi.fn(),
}));
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getVocabPool: vi.fn(),
  meteredLimit: vi.fn(),
  withinAuthLimits: vi.fn(),
  getNativeLanguage: vi.fn(),
  sentry: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureRequestError: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => m.sentry);
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/word-lists', () => q);
vi.mock('@englishlearn/db/queries/student-profile', () => ({
  getNativeLanguage: m.getNativeLanguage,
}));
vi.mock('@englishlearn/db/queries/vocab-session', () => ({ hasItemReviewState: vi.fn() }));
vi.mock('@englishlearn/db/queries/lexeme-preferences', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/auth/rate-limit', () => ({
  meteredLimit: m.meteredLimit,
  withinAuthLimits: m.withinAuthLimits,
}));
vi.mock('@/lib/learner', () => ({ vocabSessionService: {} }));
vi.mock('@/lib/vocab-pool', () => ({ getVocabPool: m.getVocabPool }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');

const actions = await import('@/app/[locale]/(student)/actions/word-import');
const { slugIndex } = await import('@englishlearn/db/vocab/slug');

const USER = 'user_1';
const LIST = 'clist000000000000000000001';
const TX = { tag: 'tx' };
const lex = (lemma: string, pos: 'NOUN' | 'VERB', ru: string) => ({
  itemId: `item-${lemma}`,
  id: `lex-${lemma}`,
  lemma,
  lemmaKey: lemma,
  pos,
  sense: '',
  cefrLevel: 'A1' as const,
  conceptId: 'vocab.daily_life.a1',
  frequencyRank: null,
  collections: [],
  definitions: { en: `the ${lemma}` },
  translations: { ru },
  variants: [],
  examples: [],
  collocations: [],
  ipa: null,
});
const ROWS = [
  lex('go', 'VERB', 'идти'),
  lex('child', 'NOUN', 'ребёнок'),
  lex('bus stop', 'NOUN', 'остановка'),
  lex('run', 'VERB', 'бежать'),
  lex('apple', 'NOUN', 'яблоко'),
];
const { bySlug } = slugIndex(ROWS);
const POOL = {
  lexemes: ROWS,
  byItemId: new Map(ROWS.map((r) => [r.itemId, r])),
  itemIdByLexemeId: new Map(ROWS.map((r) => [r.id, r.itemId])),
  bySlug,
  slugByItemId: new Map([...bySlug].map(([slug, r]) => [r.itemId, slug])),
};
const PASTE = 'went, children, bus stop, to run, apple - яблоко, qwerty';
const ok = <T>(value: T) => ({ ok: true, value });
const list = (lexemeIds: string[], archivedAt: Date | null = null) =>
  ok({
    id: LIST,
    title: 'Trip',
    source: 'CUSTOM',
    archivedAt,
    entries: lexemeIds.map((lexemeId, position) => ({ lexemeId, position, note: null })),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: USER, role: 'STUDENT' } });
  m.getVocabPool.mockResolvedValue(POOL);
  m.getNativeLanguage.mockResolvedValue('ru');
  m.withinAuthLimits.mockResolvedValue(true);
  m.meteredLimit.mockImplementation(async (_name, _subject, write) => ({
    ok: true,
    value: (await write(TX)).value,
  }));
  q.getWordList.mockResolvedValue(list([]));
  q.createWordList.mockResolvedValue(ok({ id: LIST, title: 'From text' }));
  q.addWordListEntries.mockImplementation(async (_tx, args) =>
    ok({ added: args.lexemeIds.length - 1, alreadyIn: 1, notFound: [], didNotFit: 0 }),
  );
});

describe('previewImportAction', () => {
  it('three groups by slug with display data, five words preselected; nothing written', async () => {
    const res = await actions.previewImportAction({ text: PASTE });
    if (!res.ok) throw new Error(res.error);
    const pick = (es: typeof res.value.matched) => es.map((e) => [e.term, e.preselected]);
    expect(pick(res.value.matched)).toEqual([
      ['bus stop', 'bus-stop-noun'],
      ['run', 'run-verb'],
      ['apple', 'apple-noun'],
    ]);
    expect(pick(res.value.lemmatized)).toEqual([
      ['went', 'go-verb'],
      ['children', 'child-noun'],
    ]);
    expect(res.value.matched[2]?.options).toEqual([
      {
        slug: 'apple-noun',
        headword: 'apple',
        pos: 'NOUN',
        level: 'A1',
        gloss: 'яблоко',
        inList: false,
      },
    ]);
    expect(res.value).toMatchObject({
      notFound: ['qwerty'],
      notProcessed: 0,
      skipped: 0,
      capacityLeft: 500,
    });
    expect(JSON.stringify(res)).not.toMatch(/lex-|item-|itemId|lexemeId/);
    expect(m.withinAuthLimits).toHaveBeenCalledWith([['vocab-search:user', USER]]);
    expect(m.meteredLimit).not.toHaveBeenCalled();
    expect(q.createWordList).not.toHaveBeenCalled();
    expect(q.addWordListEntries).not.toHaveBeenCalled();
  });

  it('into a list: owner-checked, words already in it marked and not preselected, room left', async () => {
    q.getWordList.mockResolvedValueOnce(list(['lex-apple', 'lex-go']));
    const res = await actions.previewImportAction({ text: 'apple, went', listId: LIST });
    expect(q.getWordList).toHaveBeenCalledWith({ tag: 'prisma' }, { ownerId: USER, listId: LIST });
    expect(res).toMatchObject(
      ok({
        matched: [
          { term: 'apple', preselected: null, options: [{ slug: 'apple-noun', inList: true }] },
        ],
        lemmatized: [{ term: 'went', preselected: null }],
        capacityLeft: 498,
      }),
    );
  });

  it.each([
    ['another learner’s list', { ok: false, error: 'NOT_FOUND' }],
    ['an archived list', list([], new Date())],
  ])('%s is NOT_FOUND', async (_, found) => {
    q.getWordList.mockResolvedValueOnce(found);
    expect(await actions.previewImportAction({ text: 'apple', listId: LIST })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('too long, empty, over the budget, malformed: refused, nothing read', async () => {
    expect(await actions.previewImportAction({ text: 'a'.repeat(5001) })).toEqual({
      ok: false,
      error: 'TOO_LONG',
    });
    expect(await actions.previewImportAction({ text: ' ; , ' })).toEqual({
      ok: false,
      error: 'EMPTY',
    });
    expect(await actions.previewImportAction({ text: 'a'.repeat(10_001) })).toEqual({
      ok: false,
      error: 'INVALID',
    });
    expect(m.withinAuthLimits).not.toHaveBeenCalled();
    m.withinAuthLimits.mockResolvedValueOnce(false);
    expect(await actions.previewImportAction({ text: 'apple' })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    });
    expect(m.getVocabPool).not.toHaveBeenCalled();
  });

  it('a tutor is refused before anything is read', async () => {
    m.auth.mockResolvedValue({ user: { id: USER, role: 'TUTOR' } });
    expect(await actions.previewImportAction({ text: 'apple' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(m.getVocabPool).not.toHaveBeenCalled();
  });
});

describe('V2-17: pasted text is never logged, reported or recorded', () => {
  const MARKER = 'zqx-private-marker';
  const spies = () => [
    ...(['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    ),
    ...Object.values(m.sentry),
    m.withinAuthLimits,
    m.meteredLimit,
    ...Object.values(q),
  ];
  const leaked = (fns: ReturnType<typeof spies>) =>
    fns
      .flatMap((fn) => fn.mock.calls)
      .filter((args) =>
        JSON.stringify(args, (_k, v) =>
          v instanceof Error ? `${v.name}: ${v.message} ${v.stack}` : v,
        ).includes(MARKER),
      );
  afterEach(() => vi.restoreAllMocks());

  it('the success path: the text reaches no log, no report, no database call', async () => {
    const fns = spies();
    const res = await actions.previewImportAction({ text: `apple, ${MARKER}`, listId: LIST });
    expect(res).toMatchObject(ok({ notFound: [MARKER] })); // back to the learner's screen only
    expect(leaked(fns)).toEqual([]);
  });

  it('a failure logs the error’s name only, even when its message quotes the text', async () => {
    const fns = spies();
    m.getVocabPool.mockRejectedValueOnce(new TypeError(`cannot read ${MARKER}`));
    expect(await actions.previewImportAction({ text: `apple ${MARKER}` })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    expect(console.error).toHaveBeenCalledWith('previewImport failed', 'TypeError');
    expect(leaked(fns)).toEqual([]);
  });
});

describe('confirmImportAction', () => {
  it('into a list: by slug, the rest fitted, already-in words skipped and counted', async () => {
    const res = await actions.confirmImportAction({
      slugs: ['go-verb', 'apple-noun', 'apple-noun'],
      listId: LIST,
    });
    expect(res).toEqual(ok({ listId: LIST, added: 1, alreadyIn: 1, notFound: 0, didNotFit: 0 }));
    expect(q.addWordListEntries).toHaveBeenCalledWith(TX, {
      ownerId: USER,
      listId: LIST,
      lexemeIds: ['lex-go', 'lex-apple'],
      overflow: 'fit',
    });
  });

  it('a new list from text is an IMPORT list', async () => {
    const res = await actions.confirmImportAction({
      slugs: ['go-verb', 'child-noun'],
      title: 'From text',
    });
    expect(res).toMatchObject(ok({ listId: LIST, added: 1, alreadyIn: 1 }));
    expect(q.createWordList).toHaveBeenCalledWith(TX, {
      ownerId: USER,
      title: 'From text',
      source: 'IMPORT',
    });
  });

  it.each([
    ['both a list and a title', { slugs: ['go-verb'], listId: LIST, title: 'x' }],
    ['neither', { slugs: ['go-verb'] }],
    ['no word', { slugs: [], listId: LIST }],
    ['501 words', { slugs: Array.from({ length: 501 }, (_, i) => `w${i}-noun`), listId: LIST }],
    ['an id instead of a slug', { slugs: ['lex-go!'], listId: LIST }],
  ])('%s is INVALID, nothing written', async (_, input) => {
    expect(await actions.confirmImportAction(input)).toEqual({ ok: false, error: 'INVALID' });
    expect(m.meteredLimit).not.toHaveBeenCalled();
  });
});
