import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';

/**
 * Item.hasPractice against a real, migrated Postgres: selection filters on the
 * column instead of reading content, so the column must never disagree with
 * content. The guarantee is the Item_hasPractice_matches_content CHECK, which
 * only the database can prove. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Every row hangs off a concept this run
 * creates and deletes.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error(
    'DIAG_DB_TEST_URL is not set in CI: the item practice column DB test would be skipped',
  );
}

const RUN = `test-haspractice-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const INDEX = 'Item_status_hasPractice_idx';
const practice = { type: 'choice', prompt: 'I ___ here.', options: ['am', 'is'], correctIndex: 0 };

describe.skipIf(!url)('Item.hasPractice (real Postgres)', () => {
  let db: PrismaClient;

  const item = (content: object, hasPractice?: boolean) =>
    db.item.create({
      data: {
        conceptId: RUN,
        kind: 'VOCAB_WORD',
        cefrLevel: 'A2',
        status: 'PUBLISHED',
        content,
        ...(hasPractice === undefined ? {} : { hasPractice }),
      },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({
      data: { id: RUN, name: RUN, cefrLevel: 'A2', category: 'VOCAB' },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.concept.deleteMany({ where: { id: RUN } });
    await db.$disconnect();
  });

  it('defaults to false for an item without a practice question', async () => {
    await expect(item({ source: {} })).resolves.toMatchObject({ hasPractice: false });
  });

  it('is true for an item with a practice object', async () => {
    await expect(item({ source: {}, practice }, true)).resolves.toMatchObject({
      hasPractice: true,
    });
  });

  it.each([
    ['a practice object flagged false', { source: {}, practice }, false],
    ['a missing practice flagged true', { source: {} }, true],
    ['a JSON-null practice flagged true', { source: {}, practice: null }, true],
    ['a non-object practice flagged true', { source: {}, practice: 'x' }, true],
  ])('rejects %s (CHECK)', async (_, content, hasPractice) => {
    await expect(item(content, hasPractice)).rejects.toThrow(/Item_hasPractice_matches_content/);
  });

  it('agrees with content on every row (backfill + CHECK)', async () => {
    const [row] = await db.$queryRaw<{ mismatched: bigint }[]>`
      SELECT count(*) AS mismatched FROM "Item"
      WHERE "hasPractice" <> (jsonb_typeof("content" -> 'practice') IS NOT DISTINCT FROM 'object')`;
    expect(row?.mismatched).toBe(0n);
  });

  it('has the (status, hasPractice) index', async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Item' AND indexname = ${INDEX}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('USING btree (status, "hasPractice")');
  });
});
