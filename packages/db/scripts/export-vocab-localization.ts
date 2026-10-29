// packages/db/scripts/export-vocab-localization.ts
//
// Writes the localized CEFR-J lexemes (REVIEW or PUBLISHED, translations set)
// to the committed snapshot packages/db/data/cefr-j-v1.5-localized.json,
// keyed by [lemmaKey, pos, sense]. Read only: runs inside a READ ONLY
// transaction. Run it against the database the model run wrote to (dev).
//
// Usage (from packages/db; DATABASE_URL from .env):
//   pnpm vocab:export-localization [--model claude-haiku-5-5]

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../src/create-client';
import { loadCefrJDataset } from '../src/vocab/dataset';
import {
  LOCALIZATION_SNAPSHOT_URL,
  LocalizationSnapshotSchema,
  sortSnapshotEntries,
} from '../src/vocab/localization-snapshot';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: 'string' } } });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  console.log(`Source host: ${new URL(url).hostname}`);

  const db = createPrismaClient(url, { log: ['error'] });
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.lexeme.findMany({
        where: { status: { in: ['REVIEW', 'PUBLISHED'] }, NOT: { translations: { equals: {} } } },
        select: {
          lemmaKey: true,
          pos: true,
          sense: true,
          cefrLevel: true,
          definitions: true,
          translations: true,
          examples: true,
          collocations: true,
        },
      });
    });
    const { source } = loadCefrJDataset();
    // Parsing proves every row still satisfies the content schemas.
    const snapshot = LocalizationSnapshotSchema.parse({
      source: `${source.name} ${source.version}`,
      model: values.model ?? 'claude-haiku-5-5',
      exportedAt: new Date().toISOString(),
      entries: sortSnapshotEntries(LocalizationSnapshotSchema.shape.entries.parse(rows)),
    });
    // One entry per line: compact, and a re-export diffs lexeme by lexeme.
    const { entries, ...header } = snapshot;
    const head = JSON.stringify(header).slice(0, -1);
    const body = entries.map((e) => JSON.stringify(e)).join(',\n');
    writeFileSync(LOCALIZATION_SNAPSHOT_URL, `${head},"entries":[\n${body}\n]}\n`);
    console.log(`${snapshot.entries.length} entries → ${LOCALIZATION_SNAPSHOT_URL.pathname}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
