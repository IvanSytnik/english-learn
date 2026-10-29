import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLearnerService } from '../service/learner-service';
import { createPrismaLearnerDb } from '../service/prisma-db';

/**
 * V3 on real Postgres: recordOutcome records only practisable items
 * (PUBLISHED with hasPractice). A DRAFT item or one without a practice
 * question is ITEM_NOT_FOUND and leaves no LearnerEvent, mastery or review
 * row. The vocab pool (B2.5) is its mirror: recordVocabOutcome records only a
 * published lexeme-backed item, and neither entry point records the other's. Same gate as the other DB tests (DIAG_DB_TEST_URL; required in CI).
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the recordOutcome gate DB test would be skipped',
  );
}

const RUN = `test-gate-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.concept`;
const VOCAB_CONCEPT = `${RUN}.vocab`;
const PRACTICE = { source: {}, practice: { type: 'choice' } };

describe.skipIf(!url)('recordOutcome gate (real Postgres)', () => {
  let prisma: PrismaClient;
  const items = { published: '', draft: '', noPractice: '', vocab: '', vocabOnReview: '' };

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

    await prisma.concept.create({
      data: { id: VOCAB_CONCEPT, name: 'gate vocab', cefrLevel: 'A1', category: 'VOCAB' },
    });
    const vocabItem = async (lemma: string, status: 'PUBLISHED' | 'REVIEW') => {
      const lexeme = await prisma.lexeme.create({
        data: {
          lemma,
          lemmaKey: lemma,
          pos: 'NOUN',
          cefrLevel: 'A1',
          cefrJLevel: 'A1',
          definitions: { en: 'x' },
          translations: { ru: 'x' },
          status,
        },
      });
      return (
        await prisma.item.create({
          data: {
            conceptId: VOCAB_CONCEPT,
            kind: 'VOCAB_WORD',
            cefrLevel: 'A1',
            status: 'PUBLISHED',
            content: { headword: lemma, variants: [] },
            lexemeId: lexeme.id,
          },
        })
      ).id;
    };
    items.vocab = await vocabItem(`${RUN}-apple`, 'PUBLISHED');
    items.vocabOnReview = await vocabItem(`${RUN}-pear`, 'REVIEW');
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.concept.deleteMany({ where: { id: { in: [CONCEPT, VOCAB_CONCEPT] } } });
    await prisma.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
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

  it('records a published vocabulary item through the vocab pool only', async () => {
    const userId = await newUser('vocab');
    const service = createLearnerService(createPrismaLearnerDb(prisma));

    await expect(
      service.recordOutcome({ userId, itemId: items.vocab, correct: true }),
    ).resolves.toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(await stored(userId)).toEqual({ events: 0, masteries: 0, reviews: 0 });

    const result = await service.recordVocabOutcome({
      userId,
      itemId: items.vocab,
      correct: true,
      mode: 'recall',
      proof: true,
    });
    expect(result).toMatchObject({ ok: true, rating: 'EASY', conceptId: VOCAB_CONCEPT });
    expect(await stored(userId)).toEqual({ events: 1, masteries: 1, reviews: 1 });
    const event = await prisma.learnerEvent.findFirstOrThrow({ where: { userId } });
    expect(event.payload).toMatchObject({ mode: 'recall', proof: true, rating: 'EASY' });
  });

  it.each([
    ['a grammar item', 'published'],
    ['a vocabulary item on a REVIEW lexeme', 'vocabOnReview'],
  ] as const)('recordVocabOutcome rejects %s and writes nothing', async (_, key) => {
    const userId = await newUser(`vocab-${key}`);
    const service = createLearnerService(createPrismaLearnerDb(prisma));

    const result = await service.recordVocabOutcome({
      userId,
      itemId: items[key],
      correct: true,
      mode: 'recognition',
    });

    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
    expect(await stored(userId)).toEqual({ events: 0, masteries: 0, reviews: 0 });
  });
});
