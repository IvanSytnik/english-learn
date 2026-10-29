import { beforeEach, describe, expect, it, vi } from 'vitest';

const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/learner', () => ({ vocabSessionService: { overview } }));

const { loadVocabOverview } = await import('@/lib/vocab-overview');

const stages = (over: Partial<Record<string, number>> = {}) => ({
  new: 0,
  learning: 0,
  familiar: 0,
  known: 0,
  mastered: 0,
  ...over,
});
const concept = (conceptId: string, total: number, s: Partial<Record<string, number>>) => ({
  conceptId,
  total,
  started: total - (s.new ?? 0),
  stages: stages(s),
});

beforeEach(() => {
  vi.clearAllMocks();
  overview.mockResolvedValue({
    dueNow: 4,
    newToday: 3,
    dailyLimit: 10,
    remainingNew: 7,
    // As the service returns them: sorted by concept id.
    stages: stages({ new: 999 }),
    concepts: [
      concept('t-run.vocab', 5, { new: 5 }),
      concept('vocab.food_drink.a1', 10, { new: 6, learning: 3, known: 1 }),
      concept('vocab.food_drink.b1', 4, { new: 4 }),
      concept('vocab.personal_identification.a2', 2, { mastered: 2 }),
      concept('vocab.travel.a1', 3, { new: 1, familiar: 2 }),
    ],
  });
});

describe('loadVocabOverview', () => {
  it('groups concepts into topics in the taxonomy’s order, titled in the UI locale', async () => {
    const out = await loadVocabOverview({ userId: 'u1', uiLocale: 'ru', timeZone: 'Europe/Kyiv' });

    expect(overview).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'Europe/Kyiv' });
    expect(out.topics.map((t) => [t.topicId, t.title])).toEqual([
      ['personal_identification', 'О себе'],
      ['travel', 'Путешествия'],
      ['food_drink', 'Еда и напитки'],
    ]);
    expect(out.topics[2]).toEqual({
      topicId: 'food_drink',
      title: 'Еда и напитки',
      total: 14,
      started: 4,
      stages: stages({ new: 10, learning: 3, known: 1 }),
      levels: [
        {
          conceptId: 'vocab.food_drink.a1',
          level: 'A1',
          total: 10,
          started: 4,
          stages: stages({ new: 6, learning: 3, known: 1 }),
        },
        {
          conceptId: 'vocab.food_drink.b1',
          level: 'B1',
          total: 4,
          started: 0,
          stages: stages({ new: 4 }),
        },
      ],
    });
  });

  it('totals add up to the listed topics; a concept outside the taxonomy is left out', async () => {
    const out = await loadVocabOverview({ userId: 'u1', uiLocale: 'en', timeZone: 'UTC' });
    expect(out).toMatchObject({
      dueNow: 4,
      newToday: 3,
      dailyLimit: 10,
      remainingNew: 7,
      totalWords: 19,
      startedWords: 8,
      stages: stages({ new: 11, learning: 3, familiar: 2, known: 1, mastered: 2 }),
    });
    expect(JSON.stringify(out)).not.toContain('t-run');
  });

  it('never exposes FSRS numbers', async () => {
    const json = JSON.stringify(
      await loadVocabOverview({ userId: 'u1', uiLocale: 'en', timeZone: 'UTC' }),
    );
    expect(json).not.toMatch(/stability|difficulty|dueAt|lastReviewAt|pKnown/);
  });
});
