// packages/learner-model/scripts/build-contractions.ts
//
// Offline (B6.7c, V2-20): writes data/contractions.json — the paste import's
// contraction table — from the rules in src/vocab/import/contraction-table.ts
// and two committed inputs: the 80 excluded function words
// (packages/db/data/cefr-j-v1.5-excluded.json) and the catalogue
// (packages/db/data/cefr-j-v1.5.json). Every input is in the repo, so the
// output is reproducible: src/vocab/import/__tests__/contraction-table.test.ts
// runs the same generator and compares it with the committed file byte for
// byte. Prints the counts and the combinations a rule made but the data left
// out.
//
// Usage (from the repo root):
//   pnpm --filter @englishlearn/learner-model build:contractions
//   pnpm --filter @englishlearn/learner-model build:contractions --check   # exit 1 if the file differs

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { EXCLUDED_BY_POS } from '@englishlearn/db/vocab/excluded';
import {
  buildContractionTable,
  type ContractionInputs,
  formatContractionTable,
} from '../src/vocab/import/contraction-table';
import { normalizeTerm } from '../src/vocab/import/forms';

export const CONTRACTIONS_URL = new URL('../data/contractions.json', import.meta.url);

/** The generator's inputs, from the committed data only. */
export function loadContractionInputs(): ContractionInputs {
  const { lexemes } = loadCefrJDataset();
  return {
    excludedByPos: EXCLUDED_BY_POS,
    catalogueKeys: new Set(lexemes.map((l) => l.lemmaKey)),
    catalogueSpellings: new Set(
      lexemes.flatMap((l) => [l.lemma, ...l.variants].map(normalizeTerm)),
    ),
  };
}

function main() {
  const table = buildContractionTable(loadContractionInputs());
  const text = formatContractionTable(table);
  console.log('counts', table.counts);
  for (const d of table.dropped) console.log(`dropped ${d.key}: ${d.reason}`);
  if (process.argv.includes('--check')) {
    const same = readFileSync(CONTRACTIONS_URL, 'utf8') === text;
    console.log(same ? 'data/contractions.json is up to date' : 'data/contractions.json differs');
    process.exitCode = same ? 0 : 1;
    return;
  }
  writeFileSync(CONTRACTIONS_URL, text);
  console.log(`wrote ${table.counts.total} contractions to data/contractions.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
