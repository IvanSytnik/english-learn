// packages/db/scripts/import-cefr-j.ts
//
// Imports the CEFR-J Wordlist (packages/db/data/cefr-j-v1.5.json) as DRAFT
// Lexemes plus the VOCAB topic Concepts and their RELATED edges. Writes no
// Item. Idempotent — re-running writes only what changed (see
// src/vocab/import.ts).
//
// Needs migration 20261029200000_accept_whole_cefrj_levels on the target.
//
// Usage (from packages/db):
//   pnpm vocab:import --dry-run   # validate + normalize, print counts, no DB
//   pnpm vocab:import             # write to DATABASE_URL (packages/db/.env)

import { readFileSync } from 'node:fs';
import { createPrismaClient } from '../src/create-client';
import { importCefrJ } from '../src/vocab/import';
import { normalizeDataset } from '../src/vocab/normalize';

const DATASET = new URL('../data/cefr-j-v1.5.json', import.meta.url);

async function main(): Promise<void> {
  const { source, lexemes, skipped } = normalizeDataset(
    JSON.parse(readFileSync(DATASET, 'utf8')) as unknown,
  );
  console.log(
    `${source.name} ${source.version}: ${lexemes.length} lexemes, ${skipped.length} rows left out`,
  );

  const perConcept = new Map<string, number>();
  for (const l of lexemes) {
    const key = `${l.topic}.${l.cefrLevel.toLowerCase()}`;
    perConcept.set(key, (perConcept.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...perConcept].sort()) console.log(`  vocab.${key}: ${count}`);

  if (process.argv.includes('--dry-run')) return;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  console.log(`Target host: ${new URL(url).hostname}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const report = await importCefrJ(db, lexemes);
    console.log(
      `Concepts: ${report.concepts.created} created / ${report.concepts.total}; ` +
        `edges: ${report.edges.created} created / ${report.edges.total}; ` +
        `lexemes: ${report.lexemes.created} created, ${report.lexemes.updated} updated, ` +
        `${report.lexemes.unchanged} unchanged (${report.chunks} chunks)`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
