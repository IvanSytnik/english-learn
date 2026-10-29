import { readFileSync } from 'node:fs';
import { type NormalizedLexemeEntry, normalizeDataset } from './normalize';
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
