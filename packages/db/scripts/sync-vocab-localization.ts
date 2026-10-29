// packages/db/scripts/sync-vocab-localization.ts
//
// Applies the committed localization snapshot
// (packages/db/data/cefr-j-v1.5-localized.json) to the DRAFT lexemes that
// still have no translations, matched by [lemmaKey, pos, sense], and moves
// them DRAFT → REVIEW — the same write as the model run, no API call.
// Idempotent: a lexeme already localized or reviewed is left alone.
//
// Run after `vocab:import` on a fresh database or on prod.
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:sync-localization --dry-run   # counts only, no writes
//   pnpm vocab:sync-localization

import { createPrismaClient } from '../src/create-client';
import {
  loadLocalizationSnapshot,
  syncLocalizationSnapshot,
} from '../src/vocab/localization-snapshot';

async function main(): Promise<void> {
  const snapshot = loadLocalizationSnapshot();
  console.log(`${snapshot.source} · ${snapshot.model} · ${snapshot.entries.length} entries`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  console.log(`Target host: ${new URL(url).hostname}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const dryRun = process.argv.includes('--dry-run');
    const r = await syncLocalizationSnapshot(db, snapshot.entries, { dryRun });
    console.log(
      `${r.pending} pending (DRAFT, no translations): ${r.matched} in the snapshot, ` +
        `${r.missing} not in it, ${r.levelMismatch} with a different level (left as DRAFT).`,
    );
    console.log(dryRun ? 'Dry run: nothing written.' : `${r.written} → REVIEW.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
