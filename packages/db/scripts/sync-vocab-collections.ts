// packages/db/scripts/sync-vocab-collections.ts
//
// Writes the CEFR-J CoreInventory tags of the committed dataset
// (data/cefr-j-v1.5.json `collections`) to Lexeme.collections, matched by
// [lemmaKey, pos, sense]. Browsing tags only: no topic, concept or Item is
// touched (src/vocab/sync-collections.ts). Idempotent.
//
// Needs migration 20261103120000_lexeme_frequency_collections on the target.
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sync-collections --dry-run   # counts only, no writes
//   pnpm vocab:sync-collections

import { createPrismaClient } from '../src/create-client';
import { loadCefrJDataset } from '../src/vocab/dataset';
import { syncCollections } from '../src/vocab/sync-collections';

async function main(): Promise<void> {
  const { source, lexemes } = loadCefrJDataset();
  const perKey = new Map<string, number>();
  for (const l of lexemes) for (const k of l.collections) perKey.set(k, (perKey.get(k) ?? 0) + 1);
  console.log(`${source.name} ${source.version}: ${perKey.size} collections`);
  for (const [key, count] of [...perKey].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${key}: ${count}`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Target host: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const r = await syncCollections(db, lexemes, { dryRun });
    console.log(
      `${r.lexemes} lexemes: ${r.inDataset} in the dataset, ${r.tagged} tagged; ` +
        `${r.changed} ${dryRun ? 'would change' : `changed (${r.chunks} chunks)`}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
