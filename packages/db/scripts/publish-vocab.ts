// packages/db/scripts/publish-vocab.ts
//
// Publishes reviewed vocabulary: Lexeme REVIEW -> PUBLISHED plus one
// question-less VOCAB_WORD Item per lexeme on its topic concept (see
// src/vocab/publish.ts). The explicit admin step after the sample check of
// B2.4's localization. Idempotent; also repairs a PUBLISHED lexeme without
// an item. Any problem stops the run before a single write.
//
// Needs migration 20261029220000_vocab_item_invariants on the target.
//
// Usage (from packages/db):
//   pnpm vocab:publish --dry-run [--level A1]   # validate, print counts, no writes
//   pnpm vocab:publish [--level A1]             # write to DATABASE_URL (packages/db/.env)

import { createPrismaClient } from '../src/create-client';
import { CefrLevelValue } from '../src/schemas/learner-events';
import { loadCefrJDataset } from '../src/vocab/dataset';
import { publishVocab } from '../src/vocab/publish';

function levelArg(): CefrLevelValue | undefined {
  const i = process.argv.indexOf('--level');
  return i === -1 ? undefined : CefrLevelValue.parse(process.argv[i + 1]);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dryRun = process.argv.includes('--dry-run');
  const level = levelArg();
  console.log(`Target host: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);

  const { lexemes } = loadCefrJDataset();
  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const report = await publishVocab(db, lexemes, { dryRun, level });
    for (const [id, count] of [...report.perConcept].sort()) console.log(`  ${id}: ${count}`);
    console.log(
      `${dryRun ? 'Would publish' : 'Published'} ${report.published} lexemes; ` +
        `${dryRun ? 'would repair' : 'repaired'} ${report.repaired}; ` +
        `items created: ${report.itemsCreated} (${report.chunks} chunks)`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
