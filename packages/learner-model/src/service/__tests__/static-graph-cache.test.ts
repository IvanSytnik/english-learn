import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStaticGraphCache, createPrismaLearnerDb, STATIC_GRAPH_TTL_MS } from '../prisma-db';

/**
 * The static-graph cache in the Prisma port: user-independent reads (item
 * catalog, PREREQUISITE edges, concept levels) are served from memory within
 * the TTL; per-user reads (review state, assessed level) are always fresh.
 * A fake Prisma client counts the reads.
 */

type Review = { itemId: string; dueAt: bigint; lastReviewAt: bigint | null };

function fakePrisma() {
  const calls = { catalog: 0, reviews: 0, edges: 0, concepts: 0, profile: 0 };
  const catalogArgs: unknown[] = [];
  const state = {
    reviews: { u1: [] as Review[], u2: [] as Review[] } as Record<string, Review[]>,
    level: 'A2' as string | null,
    failCatalog: false,
  };
  const prisma = {
    item: {
      findMany: async (args: unknown) => {
        calls.catalog++;
        catalogArgs.push(args);
        if (state.failCatalog) throw new Error('db down');
        return [
          { id: 'i1', conceptId: 'c1', irtDiscrimination: 1, irtDifficulty: 0.2, cefrLevel: 'A2' },
          { id: 'i2', conceptId: 'c2', irtDiscrimination: 1.5, irtDifficulty: -1, cefrLevel: 'B1' },
        ];
      },
    },
    itemReviewState: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        calls.reviews++;
        return state.reviews[where.userId] ?? [];
      },
    },
    conceptEdge: {
      findMany: async () => {
        calls.edges++;
        return [{ fromId: 'c1', toId: 'c2', kind: 'PREREQUISITE' }];
      },
    },
    concept: {
      findMany: async () => {
        calls.concepts++;
        return [
          { id: 'c1', cefrLevel: 'A2' },
          { id: 'c2', cefrLevel: 'B1' },
        ];
      },
    },
    studentProfile: {
      findUnique: async () => {
        calls.profile++;
        return { assessedLevel: state.level };
      },
    },
  };
  const db = createPrismaLearnerDb(
    prisma as unknown as Parameters<typeof createPrismaLearnerDb>[0],
  );
  return { db, calls, catalogArgs, state };
}

describe('static graph cache (Prisma port)', () => {
  beforeEach(() => {
    clearStaticGraphCache();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_790_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStaticGraphCache();
  });

  it('reads the catalog by hasPractice, never content', async () => {
    const { db, catalogArgs } = fakePrisma();
    await db.getCandidateItems('u1');
    expect(catalogArgs).toEqual([
      {
        where: { status: 'PUBLISHED', hasPractice: true },
        select: {
          id: true,
          conceptId: true,
          irtDiscrimination: true,
          irtDifficulty: true,
          cefrLevel: true,
        },
      },
    ]);
  });

  it('serves the item catalog, edges and concept levels from cache within the TTL', async () => {
    const { db, calls } = fakePrisma();
    for (const userId of ['u1', 'u2', 'u1']) {
      await db.getCandidateItems(userId);
      await db.getPrereqEdges();
      await db.getLevelContext(userId);
      vi.advanceTimersByTime(STATIC_GRAPH_TTL_MS / 4);
    }
    expect(calls).toEqual({ catalog: 1, reviews: 3, edges: 1, concepts: 1, profile: 3 });
  });

  it('reloads after the TTL and after clearStaticGraphCache()', async () => {
    const { db, calls } = fakePrisma();
    await db.getPrereqEdges();
    vi.advanceTimersByTime(STATIC_GRAPH_TTL_MS);
    await db.getPrereqEdges();
    clearStaticGraphCache();
    await db.getPrereqEdges();
    expect(calls.edges).toBe(3);
  });

  it('merges each user’s fresh review state into the cached catalog', async () => {
    const { db, state } = fakePrisma();
    const due = (rows: Awaited<ReturnType<typeof db.getCandidateItems>>) =>
      rows.map((r) => [r.itemId, r.dueAt, r.lastReviewAt]);

    expect(due(await db.getCandidateItems('u1'))).toEqual([
      ['i1', null, null],
      ['i2', null, null],
    ]);
    state.reviews.u1 = [{ itemId: 'i2', dueAt: 5n, lastReviewAt: 4n }];
    expect(due(await db.getCandidateItems('u1'))).toEqual([
      ['i1', null, null],
      ['i2', 5n, 4n],
    ]);
    expect(due(await db.getCandidateItems('u2'))).toEqual([
      ['i1', null, null],
      ['i2', null, null],
    ]);
  });

  it('never caches the assessed level', async () => {
    const { db, state } = fakePrisma();
    expect((await db.getLevelContext('u1')).level).toBe('A2');
    state.level = 'B1';
    expect((await db.getLevelContext('u1')).level).toBe('B1');
  });

  it('does not cache a failed read', async () => {
    const { db, calls, state } = fakePrisma();
    state.failCatalog = true;
    await expect(db.getCandidateItems('u1')).rejects.toThrow('db down');
    state.failCatalog = false;
    await expect(db.getCandidateItems('u1')).resolves.toHaveLength(2);
    expect(calls.catalog).toBe(2);
  });
});
