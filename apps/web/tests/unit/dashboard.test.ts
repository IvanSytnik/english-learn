import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, isDiagnosticDone, getConceptProgress, loadVocabOverview } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  isDiagnosticDone: vi.fn(),
  getConceptProgress: vi.fn(),
  loadVocabOverview: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { studentProfile: { findUnique } } }));
vi.mock('@englishlearn/db/queries/learner-progress', () => ({ getConceptProgress }));
vi.mock('@/lib/diagnostic', () => ({ isDiagnosticDone }));
vi.mock('@/lib/vocab-overview', () => ({ loadVocabOverview }));

const { dashboardCta, loadStudentDashboard } = await import('@/lib/dashboard');
const { getConceptTheory } = await import('@englishlearn/learner-model');

const NOW = Date.UTC(2026, 9, 26, 12);
const DAY = 86_400_000;

/** Two grammar concepts: `g.base` (A2) is the prerequisite of `g.next` (B1). */
const progress = (over: { masteries?: unknown[]; reviews?: unknown[] } = {}) => ({
  concepts: [
    {
      id: 'g.base',
      name: 'base',
      title: 'Base',
      cefrLevel: 'A2',
      category: 'GRAMMAR',
      itemCount: 4,
    },
    {
      id: 'g.next',
      name: 'next',
      title: 'Next',
      cefrLevel: 'B1',
      category: 'GRAMMAR',
      itemCount: 4,
    },
    { id: 'v.word', name: 'word', title: 'Word', cefrLevel: 'B1', category: 'VOCAB', itemCount: 4 },
  ],
  masteries: [],
  reviews: [],
  prereqEdges: [{ from: 'g.base', to: 'g.next', kind: 'PREREQUISITE' }],
  ...over,
});
const started = (conceptId: string, pKnown = 0.5) => ({
  conceptId,
  pKnown,
  observationCount: 2,
  displayStage: 'DEVELOPING',
});
const review = (conceptId: string, over: Record<string, unknown> = {}) => ({
  conceptId,
  stability: 3,
  cardStatus: 'REVIEW',
  dueAt: NOW - 1,
  lastReviewAt: NOW - 2 * DAY,
  ...over,
});

const stages = { new: 4, learning: 2, familiar: 1, known: 0, mastered: 3 };
/** The full `/words` overview, with what the card must not carry. */
const VOCAB_OVERVIEW = {
  dueNow: 2,
  newToday: 3,
  dailyLimit: 10,
  remainingNew: 7,
  totalWords: 10,
  startedWords: 6,
  stages,
  topics: [{ topicId: 'travel', title: 'Travel', total: 10, started: 6, stages, levels: [] }],
};

const load = () => loadStudentDashboard({ userId: 'u1', locale: 'ru', nowMs: NOW });

beforeEach(() => {
  vi.resetAllMocks();
  findUnique.mockResolvedValue({ assessedLevel: 'B1' });
  isDiagnosticDone.mockResolvedValue(true);
  getConceptProgress.mockResolvedValue(progress());
  loadVocabOverview.mockResolvedValue(VOCAB_OVERVIEW);
});

describe('dashboardCta', () => {
  it('before the diagnostic: find the level, whatever is due', () => {
    expect(dashboardCta(false, 0)).toEqual({ kind: 'diagnostic' });
    expect(dashboardCta(false, 3)).toEqual({ kind: 'diagnostic' });
  });

  it('after: review when topics are due, else practise', () => {
    expect(dashboardCta(true, 2)).toEqual({ kind: 'review', count: 2 });
    expect(dashboardCta(true, 0)).toEqual({ kind: 'practice' });
  });
});

describe('loadStudentDashboard', () => {
  it('reads this learner, in the request locale', async () => {
    await load();
    expect(findUnique.mock.calls[0]?.[0].where).toEqual({ userId: 'u1' });
    expect(isDiagnosticDone).toHaveBeenCalledWith('u1');
    expect(getConceptProgress.mock.calls[0]?.slice(1)).toEqual(['u1', 'ru']);
  });

  it('after the diagnostic, nothing started: level, practice CTA, week, recommended start', async () => {
    const d = await load();
    expect(d.diagnosticDone).toBe(true);
    expect(d.level).toBe('B1');
    expect(d.cta).toEqual({ kind: 'practice' });
    expect(d.showWeekRhythm).toBe(true);
    expect(d.sections.map((s) => [s.category, s.concepts.map((c) => c.id)])).toEqual([
      ['GRAMMAR', ['g.base', 'g.next']],
      ['VOCAB', ['v.word']],
    ]);
    const next = d.sections[0]?.concepts[1];
    expect(next).toMatchObject({ isLocked: true, lockedBy: [{ id: 'g.base', title: 'Base' }] });
    expect(d.sections.flatMap((s) => s.concepts).filter((c) => c.isRecommendedStart)).toHaveLength(
      1,
    );
  });

  it('a done diagnostic without a stored level: no level line, no recommended start', async () => {
    findUnique.mockResolvedValue({ assessedLevel: null });
    const d = await load();
    expect(d.level).toBeNull();
    expect(d.sections.flatMap((s) => s.concepts).some((c) => c.isRecommendedStart)).toBe(false);
  });

  it('before the diagnostic: no level, no recommendation, no week until something is practised', async () => {
    isDiagnosticDone.mockResolvedValue(false);
    const fresh = await load();
    expect([fresh.diagnosticDone, fresh.level, fresh.cta, fresh.showWeekRhythm]).toEqual([
      false,
      null,
      { kind: 'diagnostic' },
      false,
    ]);
    expect(fresh.sections.flatMap((s) => s.concepts).some((c) => c.isRecommendedStart)).toBe(false);

    getConceptProgress.mockResolvedValue(
      progress({ masteries: [started('g.base')], reviews: [review('g.base')] }),
    );
    const practised = await load();
    expect(practised.cta).toEqual({ kind: 'diagnostic' });
    expect(practised.showWeekRhythm).toBe(true);
  });

  it('counts due topics for the review CTA', async () => {
    getConceptProgress.mockResolvedValue(
      progress({
        masteries: [started('g.base'), started('v.word')],
        reviews: [review('g.base'), review('g.base'), review('v.word')],
      }),
    );
    expect((await load()).cta).toEqual({ kind: 'review', count: 2 });
  });

  it('serialises the last practice as ISO and exposes only whitelisted fields', async () => {
    getConceptProgress.mockResolvedValue(
      progress({
        masteries: [started('g.base', 0.4321)],
        reviews: [review('g.base', { stability: 12.345 })],
      }),
    );
    const d = await load();
    const base = d.sections[0]?.concepts[0];
    expect(base?.lastPracticedAt).toBe(new Date(NOW - 2 * DAY).toISOString());
    expect(Object.keys(base ?? {}).sort()).toEqual(
      [
        'category',
        'cefrLevel',
        'id',
        'isFading',
        'isLocked',
        'isRecommendedStart',
        'itemCount',
        'lastPracticedAt',
        'lockedBy',
        'practicedItemCount',
        'requires',
        'stage',
        'theory',
        'title',
        'unlocks',
      ].sort(),
    );
    const json = JSON.stringify(d);
    for (const leak of ['pKnown', '0.4321', 'stability', '12.345', 'dueAt']) {
      expect(json).not.toContain(leak);
    }
  });

  it('a grammar topic carries its theory in the native language, not the URL locale', async () => {
    findUnique.mockResolvedValue({ assessedLevel: 'B1', nativeLanguage: 'uk' });
    getConceptProgress.mockResolvedValue({
      ...progress(),
      concepts: [
        {
          id: 'grammar.past_simple',
          name: 'Past Simple',
          title: 'Past Simple',
          cefrLevel: 'A2',
          category: 'GRAMMAR',
          itemCount: 4,
        },
        progress().concepts[2],
      ],
      prereqEdges: [],
    });
    const d = await load();
    const [grammar, vocab] = d.sections.flatMap((s) => s.concepts);
    expect(findUnique.mock.calls[0]?.[0].select).toMatchObject({ nativeLanguage: true });
    expect(grammar?.theory).toEqual(getConceptTheory('grammar.past_simple', 'uk'));
    expect(vocab?.theory).toBeNull();
  });

  it('theory language: no native language → URL locale; other → English', async () => {
    const withGrammar = () => ({
      ...progress(),
      concepts: [{ ...progress().concepts[0], id: 'grammar.plurals' }],
      prereqEdges: [],
    });
    getConceptProgress.mockResolvedValue(withGrammar());
    findUnique.mockResolvedValue({ assessedLevel: 'B1', nativeLanguage: null });
    expect((await load()).sections[0]?.concepts[0]?.theory?.locale).toBe('ru');
    findUnique.mockResolvedValue({ assessedLevel: 'B1', nativeLanguage: 'other' });
    expect((await load()).sections[0]?.concepts[0]?.theory?.locale).toBe('en');
  });

  it('a failing progress query still yields the CTA, without a list', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getConceptProgress.mockRejectedValue(new Error('db down'));
    const d = await load();
    expect(d.cta).toEqual({ kind: 'practice' });
    expect(d.sections).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('reads the vocabulary overview in UTC, in the request locale', async () => {
    await load();
    expect(loadVocabOverview).toHaveBeenCalledExactlyOnceWith({
      userId: 'u1',
      uiLocale: 'ru',
      timeZone: 'UTC',
    });
  });

  it('hands the card the aggregates only: no topics, no FSRS number', async () => {
    loadVocabOverview.mockResolvedValue({
      ...VOCAB_OVERVIEW,
      stages: { ...stages, stability: 12.345 },
      pKnown: 0.4321,
    });
    const d = await load();
    expect(d.vocab).toEqual({
      totalWords: 10,
      dueNow: 2,
      newToday: 3,
      dailyLimit: 10,
      remainingNew: 7,
      stages,
    });
    const json = JSON.stringify(d.vocab);
    for (const leak of ['topics', 'Travel', 'startedWords', 'stability', '12.345', 'pKnown']) {
      expect(json).not.toContain(leak);
    }
  });

  it('a failing vocabulary read leaves the card out, the rest intact', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadVocabOverview.mockRejectedValue(new Error('db down'));
    const d = await load();
    expect(d.vocab).toBeNull();
    expect(d.cta).toEqual({ kind: 'practice' });
    expect(d.sections).toHaveLength(2);
    expect(error).toHaveBeenCalledWith('[dashboard] vocabulary overview failed', expect.any(Error));
    error.mockRestore();
  });
});
