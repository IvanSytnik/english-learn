// packages/db/scripts/add-cefr-j-shadowed.ts
//
// Offline, run once per source version (B6.2b): marks the dataset entries
// whose headword the CEFR-J Wordlist also lists under a part of speech the
// import leaves out (modal auxiliary, be-/do-/have-verb, determiner,
// infinitive-to) with `shadowedByExcludedPos: true` (src/vocab/shadowed.ts).
// vocab:sync-frequency ranks them as secondary senses — offline, from the
// committed dataset. Only that flag is rewritten.
//
// Usage (from packages/db; the CSV is not in the repo):
//   pnpm exec tsx scripts/add-cefr-j-shadowed.ts path/to/cefrj-vocabulary-profile-1.5.csv

import { readFileSync, writeFileSync } from 'node:fs';
import { csvRecords } from '../src/vocab/cefr-j-csv';
import { CEFR_J_DATASET_URL, formatCefrJDataset } from '../src/vocab/dataset';
import { CefrJDatasetSchema } from '../src/vocab/normalize';
import { excludedHeadwordKeys, isShadowedByExcludedPos } from '../src/vocab/shadowed';

const NOTE =
  'shadowedByExcludedPos: true marks a kept entry whose headword the source also lists ' +
  'under a left-out part of speech (or is a be-/have-verb form it omits: being, having); ' +
  'its frequency belongs to that entry, so it ranks as a secondary sense.';

function main(): void {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error('Usage: add-cefr-j-shadowed.ts <cefrj csv>');
  const excluded = excludedHeadwordKeys(csvRecords(readFileSync(csvPath, 'utf8')));
  const raw = CefrJDatasetSchema.parse(JSON.parse(readFileSync(CEFR_J_DATASET_URL, 'utf8')));

  const flagged: string[] = [];
  const entries = raw.entries.map((entry) => {
    const { shadowedByExcludedPos: _old, ...rest } = entry;
    if (!isShadowedByExcludedPos(entry, excluded)) return rest;
    flagged.push(`${entry.lemma} (${entry.pos})`);
    return { ...rest, shadowedByExcludedPos: true as const };
  });

  const dataset = CefrJDatasetSchema.parse({ source: { ...raw.source, shadowed: NOTE }, entries });
  writeFileSync(CEFR_J_DATASET_URL, formatCefrJDataset(dataset));
  console.log(`${excluded.size} excluded headword keys; ${flagged.length} entries shadowed:`);
  console.log(flagged.join(', '));
}

main();
