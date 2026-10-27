import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY_CONFIG } from '../../policy/types';
import type {
  AttemptOutcomeRow,
  CandidateItemRow,
  ConceptCountsRow,
  LearnerModelDb,
  LevelContextRow,
  MasterySnapshotRow,
  PrereqEdgeRow,
} from '../db-port';
import { createSelectionService } from '../selection-service';

/** In-memory fake of the port — no Prisma, per Day 7 pattern. */
function fakeDb(data: {
  masteries?: MasterySnapshotRow[];
  edges?: PrereqEdgeRow[];
  counts?: ConceptCountsRow[];
  candidates?: CandidateItemRow[];
  start?: LevelContextRow;
  outcomes?: AttemptOutcomeRow[];
}): LearnerModelDb {
  return {
    getItemForOutcome: async () => null,
    runInTx: async (fn) => fn({}),
    getMasterySnapshots: async () => data.masteries ?? [],
    getPrereqEdges: async () => data.edges ?? [],
    getConceptEventCounts: async () => data.counts ?? [],
    getCandidateItems: async () => data.candidates ?? [],
    getLevelContext: async () => data.start ?? { level: null, concepts: [] },
    getAttemptOutcomes: async () => data.outcomes ?? [],
  };
}

const cand = (itemId: string, conceptId: string, dueAt: bigint | null): CandidateItemRow => ({
  itemId,
  conceptId,
  irtDiscrimination: 1,
  irtDifficulty: 0,
  cefrLevel: 'B1',
  dueAt,
  lastReviewAt: null,
});

describe('SelectionService.selectNext', () => {
  it('returns NO_CANDIDATES when pool empty', async () => {
    const svc = createSelectionService(fakeDb({}));
    const out = await svc.selectNext({ userId: 'u1', nowMs: 1000, seed: 1 });
    expect(out.ok).toBe(false);
  });

  it('picks a due item over a fresh one', async () => {
    const now = 1_700_000_000_000;
    const svc = createSelectionService(
      fakeDb({
        candidates: [cand('fresh', 'c.a', null), cand('due', 'c.b', BigInt(now - 1000))],
      }),
    );
    const out = await svc.selectNext({ userId: 'u1', nowMs: now, seed: 5 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.itemId).toBe('due');
      expect(out.result.reason).toBe('REVIEW_DUE');
    }
  });

  it('is deterministic for a fixed seed', async () => {
    const svc = createSelectionService(
      fakeDb({
        candidates: [cand('i.a', 'c.a', null), cand('i.b', 'c.b', null), cand('i.c', 'c.c', null)],
      }),
    );
    const a = await svc.selectNext({ userId: 'u1', nowMs: 1000, seed: 99 });
    const b = await svc.selectNext({ userId: 'u1', nowMs: 1000, seed: 99 });
    expect(a).toEqual(b);
  });

  it('respects the introduction gate through the full path', async () => {
    const svc = createSelectionService(
      fakeDb({
        candidates: [cand('locked', 'present_perfect', null), cand('free', 'vocab.free', null)],
        edges: [{ from: 'past_simple', to: 'present_perfect', kind: 'PREREQUISITE' }],
        masteries: [
          {
            conceptId: 'past_simple',
            pKnown: 0.1,
            observationCount: 2,
            lastUpdatedAt: 0n,
            pForgetLambda: 0.01,
          },
        ],
      }),
    );
    const out = await svc.selectNext({ userId: 'u1', nowMs: 1000, seed: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.itemId).toBe('free');
  });

  it('skips excludeItemIds, falling back to the full pool if nothing else is left', async () => {
    const now = 10_000;
    const svc = createSelectionService(
      fakeDb({ candidates: [cand('due', 'c.a', 1000n), cand('other', 'c.a', null)] }),
    );
    const skipped = await svc.selectNext({
      userId: 'u1',
      nowMs: now,
      seed: 1,
      excludeItemIds: ['due'],
    });
    expect(skipped.ok && skipped.result.itemId).toBe('other');

    const all = await svc.selectNext({
      userId: 'u1',
      nowMs: now,
      seed: 1,
      excludeItemIds: ['due', 'other'],
    });
    expect(all.ok && all.result.itemId).toBe('due');
  });
});

describe('SelectionService.selectNext — start concept', () => {
  const NOW = 1_700_000_000_000;
  const candidates = [
    cand('i.a', 'c.a2', null),
    cand('i.b', 'c.b1', null),
    cand('i.c', 'c.b2', null),
  ];
  const start: LevelContextRow = {
    level: 'B1',
    concepts: [
      { id: 'c.a2', cefrLevel: 'A2' },
      { id: 'c.b1', cefrLevel: 'B1' },
      { id: 'c.b2', cefrLevel: 'B2' },
      // Ties with c.b1 and wins on id, but has nothing to practise: never
      // the start concept (it would silently fall through to Thompson).
      { id: 'c.b0.empty', cefrLevel: 'B1' },
    ],
  };
  const picks = async (db: LearnerModelDb) => {
    const svc = createSelectionService(db);
    const seen = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const out = await svc.selectNext({ userId: 'u1', nowMs: NOW, seed });
      if (out.ok) seen.add(out.result.conceptId);
    }
    return seen;
  };

  it('with an assessed level and nothing started, the first exercise is pickStartConcept’s', async () => {
    expect(await picks(fakeDb({ candidates, start }))).toEqual(new Set(['c.b1']));
  });

  it('without an assessed level Thompson decides', async () => {
    const seen = await picks(fakeDb({ candidates, start: { ...start, level: null } }));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('once any concept is started the start concept no longer applies: the draw decides', async () => {
    const db = fakeDb({
      candidates,
      start,
      masteries: [
        {
          conceptId: 'c.a2',
          pKnown: 0.3,
          observationCount: 1,
          lastUpdatedAt: 0n,
          pForgetLambda: 0.01,
        },
      ],
    });
    // Today's draw (level-aware off) spreads over the concepts.
    const svc = createSelectionService(db);
    const seen = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const out = await svc.selectNext({
        userId: 'u1',
        nowMs: NOW,
        seed,
        config: { ...DEFAULT_POLICY_CONFIG, levelAware: false },
      });
      if (out.ok) seen.add(out.result.conceptId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('SelectionService.selectNext — learner level (§8 #19)', () => {
  const NOW = 1_700_000_000_000;
  const candidates = [
    cand('i.a2', 'c.a2', null),
    cand('i.a2x', 'c.a2x', null),
    cand('i.b1', 'c.b1', null),
    cand('i.b1x', 'c.b1x', null),
    cand('i.b2', 'c.b2', null),
  ];
  const level = (assessed: LevelContextRow['level']): LevelContextRow => ({
    level: assessed,
    concepts: [
      { id: 'c.a2', cefrLevel: 'A2' },
      { id: 'c.a2x', cefrLevel: 'A2' },
      { id: 'c.b1', cefrLevel: 'B1' },
      { id: 'c.b1x', cefrLevel: 'B1' },
      { id: 'c.b2', cefrLevel: 'B2' },
    ],
  });
  // A started concept, so the start concept is out of the way.
  const started: MasterySnapshotRow[] = [
    { conceptId: 'c.b1', pKnown: 0.4, observationCount: 1, lastUpdatedAt: 0n, pForgetLambda: 0.01 },
  ];
  const tally = async (db: LearnerModelDb, config = DEFAULT_POLICY_CONFIG) => {
    const svc = createSelectionService(db);
    const n: Record<string, number> = {};
    for (let seed = 0; seed < 200; seed++) {
      const out = await svc.selectNext({ userId: 'u1', nowMs: NOW, seed, config });
      if (out.ok) n[out.result.conceptId] = (n[out.result.conceptId] ?? 0) + 1;
    }
    return n;
  };
  const share = (n: Record<string, number>, ids: string[]) =>
    ids.reduce((s, id) => s + (n[id] ?? 0), 0) / 200;
  const counting = (db: LearnerModelDb) => {
    const calls = { outcomes: 0 };
    const wrapped: LearnerModelDb = {
      ...db,
      getAttemptOutcomes: (userId) => {
        calls.outcomes += 1;
        return db.getAttemptOutcomes(userId);
      },
    };
    return { db: wrapped, calls };
  };

  it('aims at the assessed level', async () => {
    const n = await tally(fakeDb({ candidates, start: level('B1'), masteries: started }));
    expect(share(n, ['c.b1', 'c.b1x'])).toBeGreaterThan(0.9);
  });

  it('the level guard steps down after 4 misses in a row at the target level', async () => {
    const misses = Array.from({ length: 4 }, () => ({
      conceptId: 'c.b1',
      correct: false,
      hinted: false,
    }));
    const n = await tally(
      fakeDb({ candidates, start: level('B1'), masteries: started, outcomes: misses }),
    );
    expect(share(n, ['c.a2', 'c.a2x'])).toBeGreaterThan(0.9);
  });

  it('level-aware off, or no assessed level: today’s policy, and no outcomes are read', async () => {
    for (const [ctx, config] of [
      [level('B1'), { ...DEFAULT_POLICY_CONFIG, levelAware: false }],
      [level(null), DEFAULT_POLICY_CONFIG],
    ] as const) {
      const { db, calls } = counting(fakeDb({ candidates, start: ctx, masteries: started }));
      const off = await tally(db, config);
      const today = await tally(fakeDb({ candidates, start: level(null), masteries: started }), {
        ...DEFAULT_POLICY_CONFIG,
        levelAware: false,
      });
      expect(off).toEqual(today);
      expect(calls.outcomes).toBe(0);
    }
  });

  it('reads the outcomes once per selection on the level-aware path', async () => {
    const { db, calls } = counting(fakeDb({ candidates, start: level('B1'), masteries: started }));
    await createSelectionService(db).selectNext({ userId: 'u1', nowMs: NOW, seed: 1 });
    expect(calls.outcomes).toBe(1);
  });
});
