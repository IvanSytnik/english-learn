// packages/db/scripts/build-ipa-cmudict.ts
//
// Offline, run by hand when CMUdict or the catalogue changes (B6.4a): derives
// data/ipa-cmudict-us.json — `{ lemmaKey: ipa | null }` for the catalogue
// lemmas, General American IPA with stress marks (src/vocab/ipa.ts) — from a
// local copy of CMUdict. Only the derived file is committed, never the
// dictionary; its header carries the CMUdict licence text.
//
// Usage (from packages/db; files from https://github.com/cmusphinx/cmudict,
// each download in its own empty directory):
//   pnpm exec tsx scripts/build-ipa-cmudict.ts <cmudict.dict> <LICENSE> <commit-sha> <commit-date>

import { readFileSync, writeFileSync } from 'node:fs';
import { loadCefrJDataset } from '../src/vocab/dataset';
import { parseCmudict } from '../src/vocab/ipa';
import { buildIpaEntries, IPA_DATA_URL, type IpaData, IpaDataSchema } from '../src/vocab/ipa-data';
import { IPA_HETERONYMS } from '../src/vocab/ipa-heteronyms';

function main(): void {
  const [dictPath, licencePath, sha, date] = process.argv.slice(2);
  if (!dictPath || !licencePath || !sha || !date) {
    throw new Error(
      'Usage: build-ipa-cmudict.ts <cmudict.dict> <LICENSE> <commit-sha> <commit-date>',
    );
  }
  const licenceText = readFileSync(licencePath, 'utf8').trim();
  const copyright = licenceText.split('\n')[0]?.trim() ?? '';
  if (!/Carnegie Mellon University/.test(copyright)) throw new Error('Unexpected LICENSE file');
  const dict = parseCmudict(readFileSync(dictPath, 'utf8'));
  const { entries, byPos } = buildIpaEntries(loadCefrJDataset().lexemes, dict, IPA_HETERONYMS);
  const data: IpaData = IpaDataSchema.parse({
    source: {
      name: 'CMUdict',
      url: 'https://github.com/cmusphinx/cmudict',
      version: `${sha} (${date})`,
      licence: 'BSD-2-Clause',
      copyright,
      licenceText,
      conversion:
        'ARPAbet to General American IPA, stress marks before the stressed syllable (maximal onset); ' +
        'several pronunciations beyond stress-neutral variants: packages/db/src/vocab/ipa-heteronyms.ts, else null.',
    },
    entries,
    byPos,
  });
  const lines = (o: Record<string, unknown>) =>
    Object.entries(o)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n');
  writeFileSync(
    IPA_DATA_URL,
    `{\n  "source": ${JSON.stringify(data.source, null, 2).replace(/\n/g, '\n  ')},\n` +
      `  "entries": {\n${lines(data.entries)}\n  },\n  "byPos": {\n${lines(data.byPos)}\n  }\n}\n`,
  );
  const all = Object.values(data.entries).concat(
    Object.values(data.byPos).flatMap((m) => Object.values(m)),
  );
  console.log(
    `${Object.keys(data.entries).length} lemmaKeys + ${Object.keys(data.byPos).length} by part of speech; ` +
      `${all.filter((v) => v !== null).length} with IPA, ${all.filter((v) => v === null).length} null.`,
  );
}

main();
