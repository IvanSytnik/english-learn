// packages/db/scripts/sync-vocab-ipa.ts
//
// Writes the committed CMUdict IPA (data/ipa-cmudict-us.json, B6.4a) to
// Lexeme.ipa, matched by lemmaKey (and part of speech for heteronyms).
// A lexeme the file does not know is left alone. Idempotent
// (src/vocab/ipa-data.ts).
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sync-ipa --dry-run   # counts only, no writes
//   pnpm vocab:sync-ipa

import { createPrismaClient } from '../src/create-client';
import { loadIpaData, syncIpa } from '../src/vocab/ipa-data';

async function main(): Promise<void> {
  const data = loadIpaData();
  console.log(`${data.source.name} ${data.source.version} (${data.source.licence})`);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Target host: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);
  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const r = await syncIpa(db, data, { dryRun });
    console.log(
      `${r.lexemes} lexemes: ${r.inFile} in the file, ${r.withIpa} with IPA; ` +
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
