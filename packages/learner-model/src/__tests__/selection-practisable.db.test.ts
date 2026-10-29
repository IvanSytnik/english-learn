import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStaticGraphCache, createPrismaLearnerDb } from '../service/prisma-db';
import { createSelectionService } from '../service/selection-service';

/**
 * The vocab pool on real Postgres: selectNext never serves an item without a
 * practice question (hasPractice = false) or an unpublished one — not even
 * when the learner has it due for review, which would otherwise win as
 * REVIEW_DUE. Same gate as the other DB tests (DIAG_DB_TEST_URL; required in
 * CI). Every row hangs off a user and concepts this run creates.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the selection practisable DB test would be skipped',
  );
}

const RUN = `test-pool-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const VOCAB = `${RUN}.vocab`;
const NOW = 1_800_000_000_000;

describe.skipIf(!url)('selection pool isolation (real Postgres)', () => {
  let prisma: PrismaClient;
  let userId: string;
  const blocked: string[] = [];
  let practisable = '';

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    userId = (await prisma.user.create({ data: { email: `${RUN}@test.dev` } })).id;
    await prisma.concept.create({
      data: { id: VOCAB, name: 'pool', cefrLevel: 'B1', category: 'VOCAB' },
    });
    const item = async (
      kind: 'VOCAB_WORD' | 'COLLOCATION' | 'IDIOM',
      status: 'PUBLISHED' | 'DRAFT',
      withPractice: boolean,
    ) =>
      (
        await prisma.item.create({
          data: {
            conceptId: VOCAB,
            kind,
            cefrLevel: 'B1',
            status,
            content: withPractice ? { source: {}, practice: { type: 'choice' } } : { source: {} },
            hasPractice: withPractice,
          },
        })
      ).id;
    blocked.push(
      await item('VOCAB_WORD', 'PUBLISHED', false),
      await item('COLLOCATION', 'PUBLISHED', false),
      await item('IDIOM', 'PUBLISHED', false),
      await item('VOCAB_WORD', 'DRAFT', true),
    );
    practisable = await item('VOCAB_WORD', 'PUBLISHED', true);
    // Every blocked item is overdue for this learner: if one leaked into the
    // candidates, REVIEW_DUE would serve it before anything else.
    await prisma.itemReviewState.createMany({
      data: blocked.map((itemId) => ({
        userId,
        itemId,
        stability: 1,
        difficulty: 5,
        reps: 1,
        cardStatus: 'REVIEW' as const,
        dueAt: BigInt(NOW - 86_400_000),
        lastReviewAt: BigInt(NOW - 2 * 86_400_000),
      })),
    });
  });

  beforeEach(() => clearStaticGraphCache());

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.concept.deleteMany({ where: { id: VOCAB } });
    await prisma.$disconnect();
  });

  it('candidates hold the practisable item and none of the blocked ones', async () => {
    const ids = (await createPrismaLearnerDb(prisma).getCandidateItems(userId)).map(
      (c) => c.itemId,
    );
    expect(ids).toContain(practisable);
    expect(ids.filter((id) => blocked.includes(id))).toEqual([]);
  });

  it('selectNext never serves a non-practisable item, over 50 seeds', async () => {
    const service = createSelectionService(createPrismaLearnerDb(prisma));
    for (let seed = 1; seed <= 50; seed++) {
      const out = await service.selectNext({ userId, nowMs: NOW, seed });
      if (!out.ok) throw new Error(`seed ${seed}: ${out.error}`);
      expect(blocked, `seed ${seed}`).not.toContain(out.result.itemId);
    }
  });
});
