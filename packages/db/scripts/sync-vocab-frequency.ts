// packages/db/scripts/sync-vocab-frequency.ts
//
// Writes the committed wordfreq Zipf values (data/frequency-wordfreq-en.json,
// CC BY-SA 4.0) to Lexeme.frequencyZipf and the dense frequency rank of the
// PUBLISHED lexemes to Lexeme.frequencyRank (see src/vocab/frequency.ts).
// Idempotent; run after vocab:publish (the rank covers PUBLISHED only).
//
// Needs migration 20261103120000_lexeme_frequency_collections on the target.
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sync-frequency --dry-run   # counts only, no writes
//   pnpm vocab:sync-frequency

import { createPrismaClient } from '../src/create-client';
import { loadFrequencyDataset, syncFrequency } from '../src/vocab/frequency';

async function main(): Promise<void> {
  const dataset = loadFrequencyDataset();
  const { name, version, licence } = dataset.source;
  console.log(`${name} ${version} (${licence}): ${Object.keys(dataset.entries).length} lemma keys`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Target host: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const r = await syncFrequency(db, dataset, { dryRun });
    console.log(
      `${r.lexemes} lexemes: ${r.withFrequency} with a frequency, ${r.ranked} PUBLISHED ranked; ` +
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
