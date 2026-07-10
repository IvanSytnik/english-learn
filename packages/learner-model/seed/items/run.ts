/**
 * Seed runner: Items.
 *
 * Usage (from packages/learner-model):
 *   pnpm seed:items
 *
 * Idempotent: upserts by stable item ID. Validates every content payload
 * against the kind-matched Zod schema BEFORE any DB write — a malformed
 * seed item aborts the whole run with a readable error.
 *
 * PrismaClient is imported by package name — that works here because
 * learner-model is a DIFFERENT package from db (the self-import pitfall
 * from HANDOFF #26 applies only inside packages/db itself).
 */

import { PrismaClient } from '@englishlearn/db/generated/client/index.js';
import { safeParseItemContent } from '@englishlearn/db/schemas';
import { ALL_ITEMS } from './index';

const prisma = new PrismaClient();

async function main() {
  console.log(`→ Validating ${ALL_ITEMS.length} seed items…`);

  // 1. Validate all payloads up front.
  const errors: string[] = [];
  for (const item of ALL_ITEMS) {
    const result = safeParseItemContent(item.kind, item.content);
    if (!result.success) {
      errors.push(
        `  ✗ ${item.id} (${item.kind}): ${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }
  }
  if (errors.length > 0) {
    console.error(`Seed validation failed (${errors.length} items):`);
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log('  ✓ all payloads valid');

  // 2. Verify referenced concepts exist (fail early with a clear message
  //    instead of an FK violation mid-run).
  const conceptIds = [...new Set(ALL_ITEMS.map((i) => i.conceptId))];
  const existing = await prisma.concept.findMany({
    where: { id: { in: conceptIds } },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((c) => c.id));
  const missing = conceptIds.filter((id) => !existingSet.has(id));
  if (missing.length > 0) {
    console.error(`Missing concepts (run \`pnpm seed:concepts\` first): ${missing.join(', ')}`);
    process.exit(1);
  }

  // 3. Upsert.
  console.log(`→ Upserting ${ALL_ITEMS.length} items…`);
  let created = 0;
  let updated = 0;
  for (const item of ALL_ITEMS) {
    const data = {
      conceptId: item.conceptId,
      kind: item.kind,
      cefrLevel: item.cefrLevel,
      status: 'PUBLISHED' as const,
      source: 'CURATED' as const,
      content: item.content as object,
      ...(item.irtDiscrimination !== undefined
        ? { irtDiscrimination: item.irtDiscrimination }
        : {}),
      ...(item.irtDifficulty !== undefined ? { irtDifficulty: item.irtDifficulty } : {}),
    };
    const before = await prisma.item.findUnique({
      where: { id: item.id },
      select: { id: true },
    });
    await prisma.item.upsert({
      where: { id: item.id },
      create: { id: item.id, ...data },
      update: data,
    });
    if (before) updated++;
    else created++;
  }

  const byKind = await prisma.item.groupBy({
    by: ['kind'],
    _count: true,
  });
  console.log(`  ✓ ${created} created, ${updated} updated`);
  console.log('  Totals by kind:');
  for (const row of byKind) {
    console.log(`    ${row.kind}: ${row._count}`);
  }
  console.log('✓ Item seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
