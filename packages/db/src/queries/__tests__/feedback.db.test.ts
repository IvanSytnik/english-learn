import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { CreateBetaFeedbackSchema } from '../../schemas/feedback';
import { BETA_FEEDBACK_LIST_MAX, createBetaFeedback, getBetaFeedbacks } from '../feedback';

/**
 * BetaFeedback against a real, migrated Postgres: the column default, SQL NULL
 * vs JSON null for metadata and the ON DELETE CASCADE live in the migration,
 * so a mock could not prove them. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Every row hangs off users this run
 * creates and deletes.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the beta feedback DB test would be skipped');
}

const RUN = `test-feedback-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('createBetaFeedback (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  async function newUser(): Promise<string> {
    const user = await db.user.create({ data: { email: `${RUN}-${userIds.length}@test.local` } });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('stores a full report as given', async () => {
    const userId = await newUser();
    const created = await createBetaFeedback(db, {
      userId,
      kind: 'BUG',
      text: 'The audio does not play',
      url: '/en/exercises?c=1',
      itemId: 'item-1',
      conceptId: 'concept-1',
      metadata: { userAgent: 'test', nested: { phase: 'answered' } },
    });

    const row = await db.betaFeedback.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      userId,
      kind: 'BUG',
      text: 'The audio does not play',
      url: '/en/exercises?c=1',
      itemId: 'item-1',
      conceptId: 'concept-1',
      metadata: { userAgent: 'test', nested: { phase: 'answered' } },
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('defaults kind to CONTENT_ERROR, both in the schema and in the column', async () => {
    const userId = await newUser();
    const parsed = CreateBetaFeedbackSchema.parse({ text: 'Wrong translation', url: '/en' });
    const viaSchema = await createBetaFeedback(db, { ...parsed, userId });
    expect(viaSchema.kind).toBe('CONTENT_ERROR');

    const viaColumn = await db.betaFeedback.create({ data: { userId, text: 'Typo', url: '/en' } });
    expect(viaColumn.kind).toBe('CONTENT_ERROR');
  });

  it('stores missing and null optional fields as SQL NULL', async () => {
    const userId = await newUser();
    const omitted = await createBetaFeedback(db, {
      userId,
      kind: 'OTHER',
      text: 'Just a thought',
      url: '/en/dashboard',
    });
    const nulls = await createBetaFeedback(db, {
      userId,
      kind: 'SUGGESTION',
      text: 'Add dark mode',
      url: '/en/dashboard',
      itemId: null,
      conceptId: null,
      metadata: null,
    });

    for (const id of [omitted.id, nulls.id]) {
      const [row] = await db.$queryRaw<
        { itemId: unknown; conceptId: unknown; metadata: unknown }[]
      >`
        SELECT "itemId", "conceptId", "metadata" IS NULL AS metadata
        FROM "BetaFeedback" WHERE id = ${id}`;
      expect(row).toEqual({ itemId: null, conceptId: null, metadata: true });
    }
  });

  it("deletes a user's feedback together with the user", async () => {
    const userId = await newUser();
    const kept = await newUser();
    await createBetaFeedback(db, { userId, kind: 'BUG', text: 'Broken page', url: '/en' });
    await createBetaFeedback(db, { userId: kept, kind: 'BUG', text: 'Broken page', url: '/en' });

    await db.user.delete({ where: { id: userId } });

    expect(await db.betaFeedback.count({ where: { userId } })).toBe(0);
    expect(await db.betaFeedback.count({ where: { userId: kept } })).toBe(1);
  });

  it('getBetaFeedbacks: newest first, with the author', async () => {
    const userId = await newUser();
    const older = await createBetaFeedback(db, {
      userId,
      kind: 'OTHER',
      text: 'Older report',
      url: '/en/dashboard',
    });
    const newer = await createBetaFeedback(db, {
      userId,
      kind: 'BUG',
      text: 'Newer report',
      url: '/en/exercises',
    });
    await db.betaFeedback.update({
      where: { id: older.id },
      data: { createdAt: new Date(newer.createdAt.getTime() - 60_000) },
    });

    const list = await getBetaFeedbacks(db, { limit: BETA_FEEDBACK_LIST_MAX });
    const mine = list.filter((f) => f.id === older.id || f.id === newer.id);
    expect(mine.map((f) => f.id)).toEqual([newer.id, older.id]);
    expect(mine[0]?.user.email).toBe(`${RUN}-${userIds.length - 1}@test.local`);
  });
});
