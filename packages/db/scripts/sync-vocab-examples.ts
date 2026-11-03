// packages/db/scripts/sync-vocab-examples.ts
//
// Appends the extra example sentences of the committed examples snapshot
// (data/cefr-j-v1.5-examples.json, the B6.4a examples job) to Lexeme.examples,
// matched by [lemmaKey, pos, sense]. examples[0] keeps its index and text, so
// today's cards do not change; a lexeme whose examples[0] is no longer the
// sentence the pair was generated against is left alone and listed.
// Idempotent (src/vocab/examples-snapshot.ts).
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sync-examples --dry-run   # counts only, no writes
//   pnpm vocab:sync-examples

import { createPrismaClient } from '../src/create-client';
import { loadExamplesSnapshot, syncExamples } from '../src/vocab/examples-snapshot';

async function main(): Promise<void> {
  const snapshot = loadExamplesSnapshot();
  console.log(
    `Examples snapshot: ${snapshot.entries.length} lexemes · ${snapshot.source.model} · ` +
      `prompt ${snapshot.source.prompt} · ${snapshot.source.updatedAt}`,
  );

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Target host: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const r = await syncExamples(db, snapshot, { dryRun });
    console.log(
      `${r.inSnapshot} in the snapshot, ${r.missing} not in the database, ` +
        `${r.baseChanged.length} with a changed first example; ${r.changed} lexemes ` +
        `(+${r.examplesAdded} examples) ${
          dryRun ? 'would change' : `changed, ${r.written} written (${r.chunks} chunks)`
        }`,
    );
    for (const key of r.baseChanged.slice(0, 20)) console.log(`  first example changed: ${key}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
