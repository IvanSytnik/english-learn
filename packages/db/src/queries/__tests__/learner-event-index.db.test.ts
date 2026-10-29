import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';

/**
 * LearnerEvent.@@index([userId, type, occurredAt]) against a real, migrated
 * Postgres: practice-history reads ("this user's ITEM_ATTEMPTED since T")
 * rely on the column order, which only the catalog can prove. Same gate as
 * the other DB tests (DIAG_DB_TEST_URL; required in CI). Read-only.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the learner event index DB test would be skipped',
  );
}

const INDEX = 'LearnerEvent_userId_type_occurredAt_idx';

describe.skipIf(!url)('LearnerEvent composite index (real Postgres)', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(url);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('exists as a plain btree index on (userId, type, occurredAt), in that order', async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname::text, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'LearnerEvent' AND indexname = ${INDEX}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/^CREATE INDEX /);
    expect(rows[0]?.indexdef).toContain('USING btree ("userId", type, "occurredAt")');
  });
});
