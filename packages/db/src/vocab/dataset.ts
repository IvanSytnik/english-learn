import { readFileSync } from 'node:fs';
import { type CefrJDataset, type NormalizedLexemeEntry, normalizeDataset } from './normalize';
import type { VocabTopicId } from './topics';

/**
 * The committed CEFR-J dataset, read for offline scripts (import,
 * localization). Located from this module's URL: scripts run from source,
 * never through the Next.js bundler.
 */
export const CEFR_J_DATASET_URL = new URL('../../data/cefr-j-v1.5.json', import.meta.url);

export function loadCefrJDataset(): ReturnType<typeof normalizeDataset> {
  return normalizeDataset(JSON.parse(readFileSync(CEFR_J_DATASET_URL, 'utf8')) as unknown);
}

/** Lexeme unique key `[lemmaKey, pos, sense]` as one string. */
export const lexemeIdentity = (l: { lemmaKey: string; pos: string; sense: string }) =>
  `${l.lemmaKey}\u0000${l.pos}\u0000${l.sense}`;

/** Topic of each dataset lexeme, by its unique key. The database has no topic column. */
export function topicIndex(lexemes: readonly NormalizedLexemeEntry[]): Map<string, VocabTopicId> {
  return new Map(lexemes.map((l) => [lexemeIdentity(l), l.topic]));
}

/**
 * The committed file layout of the dataset: one entry per line with
 * `"key": value, …` spacing, so an offline rewrite (collections, shadowed
 * flags) diffs only the lines it changes.
 */
export function formatCefrJDataset(dataset: CefrJDataset): string {
  const inline = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(inline).join(', ')}]` : JSON.stringify(v);
  const lines = dataset.entries.map(
    (e) =>
      `    {${Object.entries(e)
        .map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`)
        .join(', ')}}`,
  );
  const source = JSON.stringify(dataset.source, null, 6).replace(/\n\}$/u, '\n  }');
  return `{\n  "source": ${source},\n  "entries": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
