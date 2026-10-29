import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLearnerService } from '../service/learner-service';
import { createPrismaLearnerDb } from '../service/prisma-db';

/**
 * V3 on real Postgres: recordOutcome records only practisable items
 * (PUBLISHED with hasPractice). A DRAFT item or one without a practice
 * question is ITEM_NOT_FOUND and leaves no LearnerEvent, mastery or review
 * row. Same gate as the other DB tests (DIAG_DB_TEST_URL; required in CI).
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the recordOutcome gate DB test would be skipped',
  );
}

const RUN = `test-gate-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.concept`;
const PRACTICE = { source: {}, practice: { type: 'choice' } };

describe.skipIf(!url)('recordOutcome gate (real Postgres)', () => {
  let prisma: PrismaClient;
  const items = { published: '', draft: '', noPractice: '' };

  const newUser = async (tag: string) =>
    (await prisma.user.create({ data: { email: `${RUN}-${tag}@test.dev` } })).id;

  const stored = async (userId: string) => ({
    events: await prisma.learnerEvent.count({ where: { userId } }),
    masteries: await prisma.conceptMastery.count({ where: { userId } }),
    reviews: await prisma.itemReviewState.count({ where: { userId } }),
  });

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    await prisma.concept.create({
      data: { id: CONCEPT, name: 'gate', cefrLevel: 'B1', category: 'GRAMMAR' },
    });
    const item = async (status: 'PUBLISHED' | 'DRAFT', withPractice: boolean) =>
      (
        await prisma.item.create({
          data: {
            conceptId: CONCEPT,
            kind: 'GRAMMAR_PATTERN',
            cefrLevel: 'B1',
            status,
            content: withPractice ? PRACTICE : { source: {} },
            hasPractice: withPractice,
          },
        })
      ).id;
    items.published = await item('PUBLISHED', true);
    items.draft = await item('DRAFT', true);
    items.noPractice = await item('PUBLISHED', false);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.concept.deleteMany({ where: { id: CONCEPT } });
    await prisma.$disconnect();
  });

  it.each([
    ['a DRAFT item', 'draft'],
    ['a PUBLISHED item without practice', 'noPractice'],
  ] as const)('rejects %s and writes nothing', async (_, key) => {
    const userId = await newUser(key);
    const service = createLearnerService(createPrismaLearnerDb(prisma));

    const result = await service.recordOutcome({ userId, itemId: items[key], correct: true });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(await stored(userId)).toEqual({ events: 0, masteries: 0, reviews: 0 });
  });

  it('records a practisable item', async () => {
    const userId = await newUser('published');
    const service = createLearnerService(createPrismaLearnerDb(prisma));

    const result = await service.recordOutcome({ userId, itemId: items.published, correct: true });

    expect(result.ok).toBe(true);
    expect(await stored(userId)).toEqual({ events: 1, masteries: 1, reviews: 1 });
  });
});
