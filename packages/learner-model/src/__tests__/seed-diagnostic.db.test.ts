import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DIAGNOSTIC_BANK } from '../../seed/diagnostic/bank';
import { seedDiagnosticBank } from '../../seed/diagnostic/seed';

/**
 * seed:diagnostic against a real, migrated, THROWAWAY Postgres (it writes the
 * real seed-diag-* ids). Same gate as the db package's DB tests:
 * DIAG_DB_TEST_URL, skipped locally without it, required in CI.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the diagnostic seed test would be skipped');
}

const STRAY = `seed-diag-retired-${Date.now().toString(36)}`;

// A seed run is ~50 upserts, the idempotency test runs it twice: over the
// 5 s default when turbo runs every package's tests against one Postgres.
const SEED_TIMEOUT_MS = 15_000;

describe.skipIf(!url)('seedDiagnosticBank (real Postgres)', () => {
  let db: PrismaClient;

  const snapshot = async () =>
    db.diagnosticItem.findMany({
      where: { id: { startsWith: 'seed-diag-' } },
      select: { id: true, kind: true, cefrLevel: true, status: true, content: true },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    db = createPrismaClient(url);
    // A seed-diag-* question that is no longer in the bank.
    await db.diagnosticItem.create({
      data: {
        id: STRAY,
        kind: 'GRAMMAR',
        cefrLevel: 'B1',
        status: 'PUBLISHED',
        content: { source: { stem: 'Old ___.', choices: ['a', 'b'], correctIndex: 0 } },
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.diagnosticItem.deleteMany({ where: { id: STRAY } });
    await db.$disconnect();
  });

  it('publishes the bank, archives what left it, and a second run changes nothing', async () => {
    const first = await seedDiagnosticBank(db, DIAGNOSTIC_BANK);
    expect(first.created + first.updated).toBe(DIAGNOSTIC_BANK.length);
    expect(first.archived).toBeGreaterThanOrEqual(1);

    const rows = await snapshot();
    expect(rows.find((r) => r.id === STRAY)?.status).toBe('ARCHIVED');
    const published = rows.filter((r) => r.status === 'PUBLISHED');
    expect(published.map((r) => r.id).sort()).toEqual(DIAGNOSTIC_BANK.map((q) => q.id).sort());

    const second = await seedDiagnosticBank(db, DIAGNOSTIC_BANK);
    expect(second).toEqual({ created: 0, updated: DIAGNOSTIC_BANK.length, archived: 0 });
    expect(await snapshot()).toEqual(rows);
  }, SEED_TIMEOUT_MS);

  it('rejects an invalid bank before writing anything', async () => {
    const before = await snapshot();
    // Every valid question is changed too, so any write before the bad one shows.
    const broken = [
      ...DIAGNOSTIC_BANK.slice(1).map((q) => ({
        ...q,
        content: {
          ...q.content,
          source: { ...q.content.source, stem: `CHANGED ${q.content.source.stem}` },
        },
      })),
      {
        ...DIAGNOSTIC_BANK[0],
        content: { source: { stem: 'x ___', choices: ['a', 'b'], correctIndex: 5 } },
      },
    ] as typeof DIAGNOSTIC_BANK;
    await expect(seedDiagnosticBank(db, broken)).rejects.toThrow(/Diagnostic bank is invalid/);
    expect(await snapshot()).toEqual(before);
  }, SEED_TIMEOUT_MS);
});
