import { describe, expect, it } from 'vitest';
import type {
  CandidateItemRow,
  ConceptCountsRow,
  LearnerModelDb,
  MasterySnapshotRow,
  PrereqEdgeRow,
  StartContextRow,
} from '../db-port';
import { createSelectionService } from '../selection-service';

/** In-memory fake of the port — no Prisma, per Day 7 pattern. */
function fakeDb(data: {
  masteries?: MasterySnapshotRow[];
  edges?: PrereqEdgeRow[];
  counts?: ConceptCountsRow[];
  candidates?: CandidateItemRow[];
  start?: StartContextRow;
}): LearnerModelDb {
  return {
    getItemForOutcome: async () => null,
    runInTx: async (fn) => fn({}),
    getMasterySnapshots: async () => data.masteries ?? [],
    getPrereqEdges: async () => data.edges ?? [],
    getConceptEventCounts: async () => data.counts ?? [],
    getCandidateItems: async () => data.candidates ?? [],
    getStartContext: async () => data.start ?? { level: null, concepts: [] },
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
  const start: StartContextRow = {
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

  it('once any concept is started it reads no start context and Thompson decides', async () => {
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
    let reads = 0;
    const counted: LearnerModelDb = {
      ...db,
      getStartContext: (userId) => {
        reads += 1;
        return db.getStartContext(userId);
      },
    };
    expect((await picks(counted)).size).toBeGreaterThan(1);
    expect(reads).toBe(0);
  });
});
