import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { getPlacementContext } from '../diagnostic-reveal';

/**
 * getPlacementContext's concept filter against a real, migrated Postgres:
 * the `content -> 'practice'` JSON test is SQL, so a mock could not prove it.
 * Same gate as the other DB tests (DIAG_DB_TEST_URL; required in CI). Only
 * rows under this run's prefix are asserted on and deleted.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the placement context DB test would be skipped',
  );
}

const RUN = `test-place-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const C = {
  practisable: `${RUN}.practisable`,
  draftOnly: `${RUN}.draft-only`,
  noPractice: `${RUN}.no-practice`,
  noItems: `${RUN}.no-items`,
} as const;
const practice = { type: 'choice', prompt: 'I ___ here.', options: ['am', 'is'], correctIndex: 0 };

describe.skipIf(!url)('getPlacementContext (real Postgres)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.createMany({
      data: Object.values(C).map((id) => ({
        id,
        name: id,
        cefrLevel: 'B1' as const,
        category: 'GRAMMAR' as const,
      })),
    });
    const item = (conceptId: string, status: 'PUBLISHED' | 'DRAFT', withPractice: boolean) => ({
      conceptId,
      kind: 'GRAMMAR_PATTERN' as const,
      cefrLevel: 'B1' as const,
      status,
      content: withPractice ? { source: {}, practice } : { source: {} },
    });
    await db.item.createMany({
      data: [
        item(C.practisable, 'PUBLISHED', true),
        item(C.practisable, 'DRAFT', false),
        item(C.draftOnly, 'DRAFT', true),
        item(C.noPractice, 'PUBLISHED', false),
      ],
    });
    await db.conceptEdge.createMany({
      data: [
        { fromId: C.practisable, toId: C.draftOnly, kind: 'PREREQUISITE' },
        { fromId: C.practisable, toId: C.noPractice, kind: 'RELATED' },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Cascades to the items and edges.
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('keeps only concepts with a PUBLISHED item that has a practice question', async () => {
    const ctx = await getPlacementContext(db, 'nobody');
    expect(ctx.concepts.filter((c) => c.id.startsWith(RUN))).toEqual([
      { id: C.practisable, cefrLevel: 'B1' },
    ]);
  });

  it('returns prerequisite edges only', async () => {
    const ctx = await getPlacementContext(db, 'nobody');
    expect(ctx.prereqEdges.filter((e) => e.from.startsWith(RUN))).toEqual([
      { from: C.practisable, to: C.draftOnly, kind: 'PREREQUISITE' },
    ]);
  });
});
