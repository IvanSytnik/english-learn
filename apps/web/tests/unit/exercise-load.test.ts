import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * loadNextExercise: the `H` hint is in the learner's native language (via
 * contentLocale), while the concept titles — chrome — stay in the interface
 * locale. Selection and the queries are stand-ins.
 */

const { selectNext, getPublishedPracticeItem, getConceptTitles, getNativeLanguage } = vi.hoisted(
  () => ({
    selectNext: vi.fn(),
    getPublishedPracticeItem: vi.fn(),
    getConceptTitles: vi.fn(),
    getNativeLanguage: vi.fn(),
  }),
);
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@/lib/learner', () => ({ selectionService: { selectNext } }));
vi.mock('@englishlearn/db/queries/exercises', () => ({
  getPublishedPracticeItem,
  getConceptTitles,
}));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));

const { loadNextExercise } = await import('@/lib/exercise/load');

const item = {
  id: 'item.vocab.travel.luggage',
  kind: 'VOCAB_WORD',
  content: {
    source: { headword: 'luggage' },
    localized: { translation: { en: 'bags', ru: 'багаж', de: 'Gepäck' } },
  },
  practice: {
    type: 'choice',
    prompt: 'My ___ is heavy.',
    options: ['luggage', 'lug'],
    correctIndex: 0,
  },
  concept: { id: 'vocab.travel', name: 'Travel' },
};

beforeEach(() => {
  vi.clearAllMocks();
  selectNext.mockResolvedValue({
    ok: true,
    result: {
      itemId: item.id,
      conceptId: 'vocab.travel',
      reason: 'NEW_INTRODUCTION',
      isNewConcept: true,
      unlockedBy: [],
      lastPracticedAt: null,
    },
  });
  getPublishedPracticeItem.mockResolvedValue(item);
  getConceptTitles.mockImplementation(
    async (ids: string[], locale: string) => new Map(ids.map((id) => [id, `${locale}:${id}`])),
  );
});

const load = (locale: 'en' | 'ru' | 'uk' | 'de') =>
  loadNextExercise({ userId: 'user_1', locale, nowMs: 0 });

describe('loadNextExercise', () => {
  it("the hint is in the native language, the title in the interface's", async () => {
    getNativeLanguage.mockResolvedValue('de');
    const view = await load('ru');
    expect(getNativeLanguage).toHaveBeenCalledWith(expect.anything(), 'user_1');
    expect(view?.hint).toBe('Gepäck');
    expect(view?.conceptTitle).toBe('ru:vocab.travel');
  });

  it('"other" → the English hint, not the interface locale', async () => {
    getNativeLanguage.mockResolvedValue('other');
    const view = await load('ru');
    expect(view?.hint).toBe('bags');
    expect(view?.conceptTitle).toBe('ru:vocab.travel');
  });

  it('not chosen or outside the list → the interface locale, as before', async () => {
    for (const stored of [null, 'pl']) {
      getNativeLanguage.mockResolvedValue(stored);
      expect((await load('ru'))?.hint, String(stored)).toBe('багаж');
    }
  });

  it('a native language without a translation falls back to English, not to the interface', async () => {
    getNativeLanguage.mockResolvedValue('uk');
    expect((await load('ru'))?.hint).toBe('bags');
  });
});
