import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaLearnerDb } from '../service/prisma-db';

/**
 * getStartContext on real Postgres: the assessed level comes from
 * StudentProfile (null without a profile or before the diagnostic) and every
 * concept carries its CEFR level. Same gate as the other DB tests.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the start context DB test would be skipped');
}

const RUN = `test-start-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!url)('getStartContext (real Postgres)', () => {
  let db: PrismaClient;
  const ids = { assessed: '', pending: '', noProfile: '' };

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({
      data: { id: `${RUN}.concept`, name: 'start', cefrLevel: 'B2', category: 'GRAMMAR' },
    });
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      const user = await db.user.create({ data: { email: `${RUN}-${key}@test.dev` } });
      ids[key] = user.id;
    }
    await db.studentProfile.create({ data: { userId: ids.assessed, assessedLevel: 'B1' } });
    await db.studentProfile.create({ data: { userId: ids.pending } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.concept.deleteMany({ where: { id: { startsWith: RUN } } });
    await db.$disconnect();
  });

  it('reads the assessed level and the concept levels', async () => {
    const ctx = await createPrismaLearnerDb(db).getStartContext(ids.assessed);
    expect(ctx.level).toBe('B1');
    expect(ctx.concepts).toContainEqual({ id: `${RUN}.concept`, cefrLevel: 'B2' });
  });

  it('null level before the diagnostic and without a profile', async () => {
    const learner = createPrismaLearnerDb(db);
    expect((await learner.getStartContext(ids.pending)).level).toBeNull();
    expect((await learner.getStartContext(ids.noProfile)).level).toBeNull();
  });
});
