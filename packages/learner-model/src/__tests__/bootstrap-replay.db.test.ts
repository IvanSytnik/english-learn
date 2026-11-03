import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../diagnostic';
import { createBootstrapService } from '../service/bootstrap-service';
import { createPrismaLearnerDb } from '../service/prisma-db';
import { replayUser } from '../service/replay';

/**
 * The bootstrap's set-based projection write (B6.2b, pitfall 199) on real
 * Postgres: the ConceptMastery rows it writes equal a replay of the same
 * events (replay folds LEARNER_BOOTSTRAPPED and writes per row, through the
 * other writer), for as many concepts as production has. Same gate as the
 * other DB tests.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the bootstrap replay DB test would be skipped',
  );
}

const RUN = `test-bsr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const CONCEPTS: BootstrapConcept[] = Array.from({ length: 68 }, (_, i) => ({
  id: `${RUN}.c${String(i).padStart(2, '0')}`,
  category: i < 16 ? 'GRAMMAR' : 'VOCAB',
  cefrLevel: (['A1', 'A2', 'B1', 'B2'] as const)[i % 4],
}));

const ANSWERS: DiagnosticAnswerFact[] = Array.from({ length: 16 }, (_, position) => ({
  axis: position % 2 === 0 ? 'GRAMMAR' : 'VOCAB',
  correct: position % 3 !== 0,
  itemLevel: 'B1',
  position,
}));

describe.skipIf(!url)('bootstrap projection write = replay (real Postgres)', () => {
  let db: PrismaClient;
  let userId = '';

  const rows = () =>
    db.conceptMastery.findMany({
      where: { userId },
      select: {
        conceptId: true,
        pKnown: true,
        pLearn: true,
        pSlip: true,
        pGuess: true,
        pForgetLambda: true,
        lastUpdatedAt: true,
        observationCount: true,
        displayStage: true,
      },
      orderBy: { conceptId: 'asc' },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.createMany({
      data: CONCEPTS.map((c) => ({
        id: c.id,
        name: c.id,
        cefrLevel: c.cefrLevel,
        category: c.category,
      })),
    });
    userId = (await db.user.create({ data: { email: `${RUN}@test.dev` } })).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('68 concepts: the live rows equal the replayed rows', async () => {
    const learner = createPrismaLearnerDb(db);
    const res = await createBootstrapService(learner).bootstrapFromDiagnostic({
      userId,
      diagnosticAttemptId: `${RUN}.attempt`,
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
    });
    expect(res.ok && res.bootstrappedConceptIds).toHaveLength(68);
    const live = await rows();
    expect(live).toHaveLength(68);

    const replay = await replayUser(learner, userId);
    expect(replay).toMatchObject({ eventsProcessed: 1, conceptsWritten: 68 });
    expect(await rows()).toEqual(live);
  });

  it('the set upsert updates existing rows in place (ON CONFLICT)', async () => {
    const learner = createPrismaLearnerDb(db);
    const [a, b] = CONCEPTS as [BootstrapConcept, BootstrapConcept];
    const write = (pKnown: number) => ({
      pKnown,
      pLearn: 0.2,
      pSlip: 0.1,
      pGuess: 0.2,
      pForgetLambda: 0,
      lastUpdatedAt: 1_700_000_000_123n,
      observationCount: 0,
      displayStage: 'NOT_STARTED' as const,
    });
    const before = await db.conceptMastery.findMany({ where: { userId }, select: { id: true } });
    await learner.runInTx((tx) =>
      tx.upsertConceptMasteries(userId, [
        { conceptId: a.id, write: write(0.11) },
        { conceptId: b.id, write: write(0.22) },
      ]),
    );
    const after = await db.conceptMastery.findMany({
      where: { userId },
      select: { id: true, conceptId: true, pKnown: true, lastUpdatedAt: true },
    });
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect(after.find((r) => r.conceptId === a.id)).toMatchObject({
      pKnown: 0.11,
      lastUpdatedAt: 1_700_000_000_123n,
    });
    expect(after.find((r) => r.conceptId === b.id)?.pKnown).toBe(0.22);
  });
});
