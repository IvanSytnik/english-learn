// packages/db/scripts/add-cefr-j-collections.ts
//
// Offline, run once per source version (B6.2): copies the CEFR-J Wordlist's
// `CoreInventory 1` / `CoreInventory 2` columns into the committed dataset
// (packages/db/data/cefr-j-v1.5.json) as `collections` keys
// (src/vocab/collections.ts). Rows are matched by the headword's first
// spelling, the source POS and the level — every dataset row exactly once.
// Topics, levels and variants are not touched.
//
// Usage (from packages/db; the CSV is not in the repo):
//   pnpm exec tsx scripts/add-cefr-j-collections.ts path/to/cefrj-vocabulary-profile-1.5.csv

import { readFileSync, writeFileSync } from 'node:fs';
import { csvRecords } from '../src/vocab/cefr-j-csv';
import { CollectionKeyValue, collectionKeyOf, sortCollections } from '../src/vocab/collections';
import { CEFR_J_DATASET_URL, formatCefrJDataset } from '../src/vocab/dataset';
import { CefrJDatasetSchema } from '../src/vocab/normalize';

const NOTE =
  'CoreInventory 1 / CoreInventory 2 columns of the source as snake_case keys ' +
  '(e.g. "Work and Jobs" -> work_jobs): browsing tags only, never a topic or concept.';

function main(): void {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error('Usage: add-cefr-j-collections.ts <cefrj csv>');
  const records = csvRecords(readFileSync(csvPath, 'utf8'));
  const raw = JSON.parse(readFileSync(CEFR_J_DATASET_URL, 'utf8')) as {
    source: Record<string, string>;
    entries: Record<string, unknown>[];
  };

  const rowKey = (headword: string, pos: string, level: string) =>
    `${(headword.split('/')[0] ?? '').trim()}\u0000${pos.trim()}\u0000${level.trim()}`;
  const byKey = new Map<string, Record<string, string>[]>();
  for (const r of records) {
    const key = rowKey(r.headword ?? '', r.pos ?? '', r.CEFR ?? '');
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  let tagged = 0;
  const entries = raw.entries.map((entry) => {
    const { collections: _old, ...rest } = entry;
    const matches = byKey.get(
      rowKey(String(entry.lemma), String(entry.pos), String(entry.cefrJLevel)),
    );
    if (matches?.length !== 1) {
      throw new Error(
        `${String(entry.lemma)} (${String(entry.pos)}): ${matches?.length ?? 0} CSV rows`,
      );
    }
    const [row] = matches as [Record<string, string>];
    const labels = [row['CoreInventory 1'], row['CoreInventory 2']]
      .map((l) => (l ?? '').trim())
      .filter((l) => l !== '');
    const keys = sortCollections(labels.map((l) => CollectionKeyValue.parse(collectionKeyOf(l))));
    if (keys.length === 0) return rest;
    tagged += 1;
    return { ...rest, collections: keys };
  });

  const dataset = CefrJDatasetSchema.parse({
    source: { ...raw.source, collections: NOTE },
    entries,
  });
  writeFileSync(CEFR_J_DATASET_URL, formatCefrJDataset(dataset));
  console.log(`${tagged} of ${entries.length} entries tagged with collections`);
}

main();
