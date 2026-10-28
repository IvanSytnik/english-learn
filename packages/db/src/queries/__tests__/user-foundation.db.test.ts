import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';

/**
 * Beta foundation fields on User against a real, migrated Postgres: the new
 * columns and the ON DELETE SET NULL on content author FKs live in the
 * migrations, so a mock could not prove them. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Every row this run creates is removed.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the user foundation DB test would be skipped',
  );
}

const RUN = `test-user-foundation-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('User beta foundation (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];
  const itemIds: string[] = [];

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
    await db.diagnosticItem.deleteMany({ where: { id: { in: itemIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it('stores passwordChangedAt and signupSource, both null by default', async () => {
    const userId = await newUser();
    const fresh = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(fresh.passwordChangedAt).toBeNull();
    expect(fresh.signupSource).toBeNull();

    const changedAt = new Date('2026-10-28T15:00:00.000Z');
    await db.user.update({
      where: { id: userId },
      data: { passwordChangedAt: changedAt, signupSource: 'beta-invite' },
    });

    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.passwordChangedAt).toEqual(changedAt);
    expect(row.signupSource).toBe('beta-invite');
  });

  it("keeps an author's content and nulls its author FKs when the user is deleted", async () => {
    const author = await newUser();
    const reviewer = await newUser();
    const item = await db.diagnosticItem.create({
      data: {
        cefrLevel: 'B1',
        kind: 'GRAMMAR',
        content: { source: { stem: 'She ___ here.', choices: ['is', 'are'], correctIndex: 0 } },
        createdById: author,
        reviewedById: reviewer,
      },
    });
    itemIds.push(item.id);

    await db.user.delete({ where: { id: author } });

    const afterAuthor = await db.diagnosticItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(afterAuthor.createdById).toBeNull();
    expect(afterAuthor.reviewedById).toBe(reviewer);

    await db.user.delete({ where: { id: reviewer } });

    const afterReviewer = await db.diagnosticItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(afterReviewer.reviewedById).toBeNull();
  });
});
