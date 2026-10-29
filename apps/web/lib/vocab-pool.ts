import 'server-only';
import { prisma } from '@englishlearn/db';
import {
  getPublishedVocabLexemes,
  type VocabLexemeRow,
} from '@englishlearn/db/queries/vocab-lexemes';

/**
 * The published vocabulary the card builder draws targets, distractors and
 * synonyms from (~5k rows). Static between publishes, so it is served from
 * memory for VOCAB_POOL_TTL_MS per process — a publish shows up within the
 * TTL. A card already on screen is unaffected by a refresh: its vocabRef
 * carries the correct index. A failed load is not cached.
 */

export const VOCAB_POOL_TTL_MS = 60_000;

export type VocabPool = {
  lexemes: readonly VocabLexemeRow[];
  byItemId: ReadonlyMap<string, VocabLexemeRow>;
};

let cached: { expiresAt: number; value: Promise<VocabPool> } | null = null;

export function getVocabPool(nowMs: number = Date.now()): Promise<VocabPool> {
  if (cached && cached.expiresAt > nowMs) return cached.value;
  const value = getPublishedVocabLexemes(prisma).then(({ rows, invalidItemIds }) => {
    if (invalidItemIds.length > 0) {
      console.error('vocab pool: unparseable published items left out', invalidItemIds);
    }
    return { lexemes: rows, byItemId: new Map(rows.map((r) => [r.itemId, r])) };
  });
  const entry = { expiresAt: nowMs + VOCAB_POOL_TTL_MS, value };
  cached = entry;
  value.catch(() => {
    if (cached === entry) cached = null;
  });
  return value;
}

/** Drops the cached pool (tests). */
export function clearVocabPoolCache(): void {
  cached = null;
}
