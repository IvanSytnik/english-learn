/**
 * Seed runner: diagnostic question bank.
 *
 * Usage (from packages/learner-model):
 *   pnpm seed:diagnostic
 *
 * Idempotent: upserts by stable id, archives seed-diag-* rows that left the
 * bank. Kept out of `db:seed`, which is not idempotent (HANDOFF gotcha 101).
 */

import { createPrismaClient } from '@englishlearn/db/create-client';
import { DIAGNOSTIC_BANK } from './bank';
import { seedDiagnosticBank } from './seed';

const prisma = createPrismaClient(process.env.DATABASE_URL);

async function main() {
  console.info(`→ Seeding ${DIAGNOSTIC_BANK.length} diagnostic questions…`);
  const { created, updated, archived } = await seedDiagnosticBank(prisma, DIAGNOSTIC_BANK);
  console.info(`  ✓ ${created} created, ${updated} updated, ${archived} archived`);

  const byCell = await prisma.diagnosticItem.groupBy({
    by: ['kind', 'cefrLevel', 'status'],
    where: { id: { startsWith: 'seed-diag-' } },
    _count: true,
    orderBy: [{ kind: 'asc' }, { cefrLevel: 'asc' }, { status: 'asc' }],
  });
  for (const row of byCell) {
    console.info(`    ${row.kind} ${row.cefrLevel} ${row.status}: ${row._count}`);
  }
  console.info('✓ Diagnostic seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
