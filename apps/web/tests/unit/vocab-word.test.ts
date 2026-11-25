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
const { loadWordPage, wordReview } = await import('@/lib/vocab-word');

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const lex = (
  lemma: string,
  over: Partial<{
    pos: 'NOUN' | 'VERB';
    sense: string;
    conceptId: string;
    collections: string[];
    ipa: string | null;
    translations: Record<string, string>;
  }> = {},
) => ({
  itemId: `item-${lemma}-${over.pos ?? 'NOUN'}-${over.sense ?? ''}`,
  id: `lex-${lemma}-${over.pos ?? 'NOUN'}-${over.sense ?? ''}`,
  lemma,
  lemmaKey: lemma,
  pos: over.pos ?? 'NOUN',
  sense: over.sense ?? '',
  cefrLevel: 'A2' as const,
  conceptId: over.conceptId ?? 'vocab.travel.a2',
  frequencyRank: 100,
  collections: over.collections ?? [],
  ipa: over.ipa === undefined ? 'ˈlʌɡɪdʒ' : over.ipa,
  definitions: { en: `the ${lemma}` },
  translations: over.translations ?? { ru: `${lemma}-ru`, uk: `${lemma}-uk` },
  examples: [
    {
      sentence: `My ${lemma} is heavy.`,
      translation: { ru: `${lemma}: тяжёлый.` },
      clozeTarget: lemma,
    },
    { sentence: `Where is the ${lemma}?`, translation: {}, clozeTarget: lemma },
  ],
  collocations: [`heavy ${lemma}`, `${lemma} allowance`],
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

const review = (dueAt: number, lapses = 0) => ({
  dueAt: BigInt(dueAt),
  cardStatus: 'REVIEW',
  stability: 30,
  lastReviewAt: BigInt(NOW - 10 * DAY),
  lapses,
});
const states = (
  over: Partial<{
    reviews: Record<string, ReturnType<typeof review>>;
    prioritized: string[];
    hidden: string[];
    proven: string[];
  }> = {},
) => ({
  reviews: new Map(Object.entries(over.reviews ?? {})),
  prioritizedItemIds: new Set(over.prioritized ?? []),
  hiddenItemIds: new Set(over.hidden ?? []),
  provenItemIds: new Set(over.proven ?? []),
});

const LUGGAGE = lex('luggage', { collections: ['travel_services', 'clothes'] });
const load = (slug: string, uiLocale: 'en' | 'ru' | 'de' = 'en') =>
  loadWordPage({ userId: 'user-1', uiLocale, slug, nowMs: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  getVocabPool.mockResolvedValue(poolOf([LUGGAGE]));
  wordStates.mockResolvedValue(states());
  getNativeLanguage.mockResolvedValue('ru');
});

describe('loadWordPage', () => {
  it('the word in the learner’s language: gloss, English definition, examples with their translation', async () => {
    const view = await load('luggage-noun', 'de');
    expect(view).toMatchObject({
      slug: 'luggage-noun',
      headword: 'luggage',
      pos: 'NOUN',
      level: 'A2',
      ipa: 'ˈlʌɡɪdʒ',
      gloss: 'luggage-ru',
      glossLang: 'ru',
      definition: 'the luggage',
      examples: [
        { sentence: 'My luggage is heavy.', translation: 'luggage: тяжёлый.' },
        // A missing translation is null, never another language's.
        { sentence: 'Where is the luggage?', translation: null },
      ],
      collocations: ['heavy luggage', 'luggage allowance'],
    });
  });

  it('an English gloss is the definition: shown once, examples without translation', async () => {
    getNativeLanguage.mockResolvedValue('other');
    const view = await load('luggage-noun');
    expect(view?.gloss).toBe('the luggage');
    expect(view?.definition).toBeNull();
    expect(view?.examples.map((e) => e.translation)).toEqual([null, null]);
  });

  it('where it lives: its topic in the UI language, browsable collections only, and the proof scope', async () => {
    const view = await load('luggage-noun', 'ru');
    expect(view?.topic).toEqual({ id: 'travel', title: expect.any(String) });
    expect(view?.topic?.title).not.toBe('travel');
    // `travel_services` is a stored tag, not a browsable collection.
    expect(view?.collections.map((c) => c.key)).toEqual(['clothes']);
    expect(view?.practice).toEqual({ concept: 'vocab.travel.a2' });
  });

  it('a word outside the topic taxonomy has no topic link and no proof scope', async () => {
    getVocabPool.mockResolvedValue(poolOf([lex('luggage', { conceptId: 'grammar.x' })]));
    const view = await load('luggage-noun');
    expect(view?.topic).toBeNull();
    expect(view?.practice).toBeNull();
  });

  it('the learner’s state: a badge, the preference and the next review in whole days', async () => {
    wordStates.mockResolvedValue(
      states({ reviews: { [LUGGAGE.itemId]: review(NOW + 2.2 * DAY) }, hidden: [LUGGAGE.itemId] }),
    );
    const view = await load('luggage-noun');
    expect(view).toMatchObject({
      badge: 'reviewing',
      preference: 'HIDDEN',
      review: { kind: 'inDays', days: 3 },
    });
    // No model number reaches the page (Axiom 4).
    expect(JSON.stringify(view)).not.toMatch(/stability|dueAt|lapses|30/);
  });

  it('a new word: not started, no review, prioritized', async () => {
    wordStates.mockResolvedValue(states({ prioritized: [LUGGAGE.itemId] }));
    expect(await load('luggage-noun')).toMatchObject({
      badge: 'not_started',
      preference: 'PRIORITIZED',
      review: { kind: 'none' },
    });
  });

  it('no Item or Lexeme id leaves the server', async () => {
    const json = JSON.stringify(await load('luggage-noun'));
    expect(json).not.toContain(LUGGAGE.itemId);
    expect(json).not.toContain(LUGGAGE.id);
  });

  it('an unknown, malformed or ambiguous slug is null (404), never a guess', async () => {
    getVocabPool.mockResolvedValue(
      poolOf([LUGGAGE, lex('bank', { sense: 'river' }), lex('bank', { sense: 'river' })]),
    );
    for (const slug of ['suitcase-noun', 'luggage', 'Luggage-Noun', '../x', 'bank-noun-river']) {
      expect(await load(slug), slug).toBeNull();
    }
    expect(wordStates).not.toHaveBeenCalled();
  });

  it('a homonym is addressed by its sense', async () => {
    getVocabPool.mockResolvedValue(
      poolOf([lex('bank', { sense: 'money' }), lex('bank', { sense: 'river' })]),
    );
    expect((await load('bank-noun-river'))?.slug).toBe('bank-noun-river');
    expect(await load('bank-noun')).toBeNull();
  });
});

describe('wordReview', () => {
  it.each([
    [null, { kind: 'none' }],
    [{ dueAt: BigInt(NOW - 1) }, { kind: 'due' }],
    [{ dueAt: BigInt(NOW) }, { kind: 'due' }],
    [{ dueAt: BigInt(NOW + 10 * 60_000) }, { kind: 'today' }],
    [{ dueAt: BigInt(NOW + DAY) }, { kind: 'inDays', days: 1 }],
    [{ dueAt: BigInt(NOW + DAY + 1) }, { kind: 'inDays', days: 2 }],
    [{ dueAt: BigInt(NOW + 40 * DAY) }, { kind: 'inDays', days: 40 }],
  ])('%o → %o', (r, expected) => {
    expect(wordReview(r, NOW)).toEqual(expected);
  });
});
