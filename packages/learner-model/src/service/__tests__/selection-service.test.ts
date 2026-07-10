import { describe, expect, it } from 'vitest';
import type {
  CandidateItemRow,
  ConceptCountsRow,
  LearnerModelDb,
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
}): LearnerModelDb {
  return {
    getItemForOutcome: async () => null,
    runInTx: async (fn) => fn({}),
    getMasterySnapshots: async () => data.masteries ?? [],
    getPrereqEdges: async () => data.edges ?? [],
    getConceptEventCounts: async () => data.counts ?? [],
    getCandidateItems: async () => data.candidates ?? [],
  };
}

const cand = (itemId: string, conceptId: string, dueAt: bigint | null): CandidateItemRow => ({
  itemId,
  conceptId,
  irtDiscrimination: 1,
  irtDifficulty: 0,
  cefrLevel: 'B1',
  dueAt,
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
});
