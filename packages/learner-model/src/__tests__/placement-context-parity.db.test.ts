import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { getPlacementContext } from '@englishlearn/db/queries/diagnostic-reveal';
import { getConceptProgress } from '@englishlearn/db/queries/learner-progress';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaLearnerDb } from '../service/prisma-db';

vi.mock('server-only', () => ({}));

/**
 * "Something to practise" is written twice: selection's getCandidateItems
 * (this package's port) and packages/db's PRACTISABLE_ITEM, read by the
 * reveal's getPlacementContext and the dashboard's getConceptProgress. A
 * start concept or a dashboard topic the policy can never serve would be a
 * dead end, so all three must see the same concepts — including on
 * `{"practice": null}` (JSON null, not SQL NULL: a broken item, never
 * practisable). Real Postgres, same gate as the other DB tests.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the placement parity DB test would be skipped',
  );
}

const RUN = `test-parity-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const practice = { type: 'choice', prompt: 'I ___ here.', options: ['am', 'is'], correctIndex: 0 };

describe.skipIf(!url)('placement concepts = selection candidates (real Postgres)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = createPrismaClient(url);
    const cases = [
      ['published-practice', 'PUBLISHED', { source: {}, practice }],
      ['published-no-practice', 'PUBLISHED', { source: {} }],
      ['published-practice-null', 'PUBLISHED', { source: {}, practice: null }],
      ['draft-practice', 'DRAFT', { source: {}, practice }],
      ['archived-practice', 'ARCHIVED', { source: {}, practice }],
    ] as const;
    await db.concept.createMany({
      data: [...cases.map(([slug]) => slug), 'no-items'].map((slug) => ({
        id: `${RUN}.${slug}`,
        name: slug,
        cefrLevel: 'A2' as const,
        category: 'VOCAB' as const,
      })),
    });
    await db.item.createMany({
      data: cases.map(([slug, status, content]) => ({
        conceptId: `${RUN}.${slug}`,
        kind: 'VOCAB_WORD' as const,
        cefrLevel: 'A2' as const,
        irtDifficulty: 0.4,
        status,
        content,
      })),
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('getPlacementContext, getConceptProgress and getCandidateItems agree on the concept set', async () => {
    const ours = (ids: string[]) => [...new Set(ids.filter((id) => id.startsWith(RUN)))].sort();
    const placement = ours((await getPlacementContext(db, 'nobody')).concepts.map((c) => c.id));
    const candidates = ours(
      (await createPrismaLearnerDb(db).getCandidateItems('nobody')).map((r) => r.conceptId),
    );
    const progress = ours((await getConceptProgress(db, 'nobody', 'en')).concepts.map((c) => c.id));
    expect(placement).toEqual([`${RUN}.published-practice`]);
    expect(candidates).toEqual(placement);
    expect(progress).toEqual(placement);
  });

  it('getCandidateItems reads the scoring columns, never the content', async () => {
    const rows = (await createPrismaLearnerDb(db).getCandidateItems('nobody')).filter((r) =>
      r.conceptId.startsWith(RUN),
    );
    expect(rows).toEqual([
      {
        itemId: expect.any(String),
        conceptId: `${RUN}.published-practice`,
        irtDiscrimination: 1,
        irtDifficulty: 0.4,
        cefrLevel: 'A2',
        dueAt: null,
        lastReviewAt: null,
      },
    ]);
  });
});
