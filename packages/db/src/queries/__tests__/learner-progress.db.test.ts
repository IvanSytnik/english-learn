import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { getConceptProgress } from '../learner-progress';

/**
 * getConceptProgress against a real, migrated Postgres: the practisable
 * filter is a JSON test in SQL and the review rows are a join, so a mock
 * could not prove either. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Only rows under this run's prefix are
 * asserted on and deleted.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the learner progress DB test would be skipped',
  );
}

const RUN = `test-progress-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const C = {
  practisable: `${RUN}.practisable`,
  titled: `${RUN}.titled`,
  archivedOnly: `${RUN}.archived-only`,
  noPractice: `${RUN}.no-practice`,
} as const;
const practice = { type: 'choice', prompt: 'I ___ here.', options: ['am', 'is'], correctIndex: 0 };
const DAY = 86_400_000;
const T0 = 1_790_000_000_000;

describe.skipIf(!url)('getConceptProgress (real Postgres)', () => {
  let db: PrismaClient;
  let learner: string;
  let other: string;
  const item: Record<'reviewed' | 'untouched' | 'fresh' | 'archived' | 'titled', string> = {
    reviewed: '',
    untouched: '',
    fresh: '',
    archived: '',
    titled: '',
  };

  beforeAll(async () => {
    db = createPrismaClient(url);
    learner = (await db.user.create({ data: { email: `${RUN}-a@test.local` } })).id;
    other = (await db.user.create({ data: { email: `${RUN}-b@test.local` } })).id;

    await db.concept.createMany({
      data: Object.values(C).map((id) => ({
        id,
        name: `name of ${id}`,
        title: id === C.titled ? { en: 'Titled', ru: 'С названием' } : undefined,
        cefrLevel: 'B1' as const,
        category: id === C.titled ? ('VOCAB' as const) : ('GRAMMAR' as const),
      })),
    });
    const mk = async (
      conceptId: string,
      status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT',
      withPractice: boolean,
    ) =>
      (
        await db.item.create({
          data: {
            conceptId,
            kind: 'GRAMMAR_PATTERN',
            cefrLevel: 'B1',
            status,
            content: withPractice ? { source: {}, practice } : { source: {} },
          },
        })
      ).id;
    item.reviewed = await mk(C.practisable, 'PUBLISHED', true);
    item.untouched = await mk(C.practisable, 'PUBLISHED', true);
    item.fresh = await mk(C.practisable, 'PUBLISHED', true);
    item.archived = await mk(C.practisable, 'ARCHIVED', true);
    await mk(C.practisable, 'PUBLISHED', false);
    await mk(C.practisable, 'DRAFT', true);
    item.titled = await mk(C.titled, 'PUBLISHED', true);
    await mk(C.archivedOnly, 'ARCHIVED', true);
    await mk(C.noPractice, 'PUBLISHED', false);

    const review = (
      userId: string,
      itemId: string,
      lastReviewAt: number | null,
      cardStatus: 'NEW' | 'REVIEW' | 'RELEARNING' = 'REVIEW',
    ) => ({
      userId,
      itemId,
      stability: 12.5,
      difficulty: 5,
      cardStatus,
      dueAt: BigInt(T0 + 3 * DAY),
      lastReviewAt: lastReviewAt === null ? null : BigInt(lastReviewAt),
    });
    await db.itemReviewState.createMany({
      data: [
        review(learner, item.reviewed, T0),
        // A state row without a review carries no memory.
        review(learner, item.fresh, null, 'NEW'),
        // No longer served: its due date must not make the concept fade.
        review(learner, item.archived, T0, 'RELEARNING'),
        review(other, item.untouched, T0),
      ],
    });

    const mastery = (userId: string, conceptId: string, pKnown: number) => ({
      userId,
      conceptId,
      pKnown,
      pLearn: 0.1,
      pSlip: 0.1,
      pGuess: 0.2,
      pForgetLambda: 0,
      lastUpdatedAt: BigInt(T0),
      observationCount: 3,
      displayStage: 'DEVELOPING' as const,
    });
    await db.conceptMastery.createMany({
      data: [mastery(learner, C.practisable, 0.55), mastery(other, C.titled, 0.95)],
    });

    await db.conceptEdge.createMany({
      data: [
        { fromId: C.practisable, toId: C.titled, kind: 'PREREQUISITE' },
        { fromId: C.practisable, toId: C.noPractice, kind: 'RELATED' },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Cascades to items, edges, masteries and review states.
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.user.deleteMany({ where: { id: { in: [learner, other].filter(Boolean) } } });
    await db.$disconnect();
  });

  const ours = <T extends { id?: string; conceptId?: string; from?: string }>(rows: T[]) =>
    rows.filter((r) => (r.id ?? r.conceptId ?? r.from ?? '').startsWith(RUN));

  it('lists only practisable concepts and counts only practisable items', async () => {
    const p = await getConceptProgress(db, learner, 'en');
    expect(ours(p.concepts).map((c) => [c.id, c.itemCount])).toEqual([
      [C.practisable, 3],
      [C.titled, 1],
    ]);
  });

  it('resolves titles for the locale and falls back to the name', async () => {
    const ru = await getConceptProgress(db, learner, 'ru');
    expect(ours(ru.concepts).map((c) => [c.title, c.category, c.cefrLevel])).toEqual([
      [`name of ${C.practisable}`, 'GRAMMAR', 'B1'],
      ['С названием', 'VOCAB', 'B1'],
    ]);
    const de = await getConceptProgress(db, learner, 'de');
    expect(ours(de.concepts)[1]?.title).toBe('Titled');
  });

  it("returns only the learner's reviewed, still practisable items", async () => {
    const p = await getConceptProgress(db, learner, 'en');
    expect(ours(p.reviews)).toEqual([
      {
        conceptId: C.practisable,
        stability: 12.5,
        cardStatus: 'REVIEW',
        dueAt: T0 + 3 * DAY,
        lastReviewAt: T0,
      },
    ]);
  });

  it("returns only the learner's masteries", async () => {
    const p = await getConceptProgress(db, learner, 'en');
    expect(ours(p.masteries)).toEqual([
      { conceptId: C.practisable, pKnown: 0.55, observationCount: 3, displayStage: 'DEVELOPING' },
    ]);
  });

  it('returns prerequisite edges only', async () => {
    const p = await getConceptProgress(db, learner, 'en');
    expect(ours(p.prereqEdges)).toEqual([
      { from: C.practisable, to: C.titled, kind: 'PREREQUISITE' },
    ]);
  });
});
