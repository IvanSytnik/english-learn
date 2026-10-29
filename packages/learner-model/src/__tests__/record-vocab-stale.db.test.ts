import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLearnerService } from '../service/learner-service';
import { createPrismaLearnerDb } from '../service/prisma-db';

/**
 * recordVocabOutcome's staleness precondition on real Postgres: one card
 * answered from several tabs at once (different idempotency keys, all served
 * for the same review state) records exactly one outcome — the user lock
 * serializes them and every later writer sees the moved lastReviewAt. A
 * retry of the winner's key still returns its outcome. Same gate as the
 * other DB tests (DIAG_DB_TEST_URL; required in CI). Rows carry this run's tag.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the vocab staleness DB test would be skipped',
  );
}

const RUN = `test-vstale-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.vocab`;

describe.skipIf(!url)('recordVocabOutcome staleness (real Postgres)', () => {
  let prisma: PrismaClient;
  let itemId = '';

  const newUser = async (tag: string) =>
    (await prisma.user.create({ data: { email: `${RUN}-${tag}@test.dev` } })).id;
  const stored = async (userId: string) => ({
    events: await prisma.learnerEvent.count({ where: { userId } }),
    review: await prisma.itemReviewState.findUnique({
      where: { userId_itemId: { userId, itemId } },
      select: { reps: true },
    }),
  });

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    await prisma.concept.create({
      data: { id: CONCEPT, name: 'vocab', cefrLevel: 'A1', category: 'VOCAB' },
    });
    const lexeme = await prisma.lexeme.create({
      data: {
        lemma: RUN,
        lemmaKey: RUN,
        pos: 'NOUN',
        cefrLevel: 'A1',
        cefrJLevel: 'A1',
        definitions: { en: 'x' },
        translations: { ru: 'x' },
        status: 'PUBLISHED',
      },
    });
    itemId = (
      await prisma.item.create({
        data: {
          conceptId: CONCEPT,
          kind: 'VOCAB_WORD',
          cefrLevel: 'A1',
          status: 'PUBLISHED',
          content: { headword: RUN, variants: [] },
          lexemeId: lexeme.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.item.deleteMany({ where: { conceptId: CONCEPT } });
    await prisma.concept.deleteMany({ where: { id: CONCEPT } });
    await prisma.lexeme.deleteMany({ where: { lemmaKey: RUN } });
    await prisma.$disconnect();
  });

  it('five tabs answering one new card concurrently record one outcome', async () => {
    const userId = await newUser('tabs');
    const service = createLearnerService(createPrismaLearnerDb(prisma));

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        service.recordVocabOutcome({
          userId,
          itemId,
          correct: i % 2 === 0,
          mode: 'recognition',
          expectedLastReviewAt: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === 'STALE')).toHaveLength(4);
    expect(await stored(userId)).toEqual({ events: 1, review: { reps: 1 } });
  });

  it('a retry of the recorded key is a duplicate, not STALE', async () => {
    const userId = await newUser('retry');
    const service = createLearnerService(createPrismaLearnerDb(prisma));
    const submit = {
      userId,
      itemId,
      correct: true,
      mode: 'recognition' as const,
      expectedLastReviewAt: null,
      idempotencyKey: crypto.randomUUID(),
    };

    const [a, b] = await Promise.all([
      service.recordVocabOutcome(submit),
      service.recordVocabOutcome(submit),
    ]);

    expect([a, b].filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect([a, b].filter((r) => r.ok && r.duplicate)).toHaveLength(1);
    expect(await stored(userId)).toEqual({ events: 1, review: { reps: 1 } });
  });

  it('the next card, served for the moved state, records', async () => {
    const userId = await newUser('next');
    const service = createLearnerService(createPrismaLearnerDb(prisma));
    const first = await service.recordVocabOutcome({
      userId,
      itemId,
      correct: true,
      mode: 'recognition',
      expectedLastReviewAt: null,
    });
    if (!first.ok) throw new Error('first answer not recorded');

    const second = await service.recordVocabOutcome({
      userId,
      itemId,
      correct: true,
      mode: 'recognition',
      expectedLastReviewAt: first.occurredAt,
    });

    expect(second).toMatchObject({ ok: true, duplicate: false });
    expect(await stored(userId)).toEqual({ events: 2, review: { reps: 2 } });
  });
});
