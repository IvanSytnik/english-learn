import type { PrismaClient } from '../generated/client/client';
import { lexemeIdentity } from './dataset';
import type { NormalizedLexemeEntry } from './normalize';

/**
 * vocab:sync-collections (B6.2): the dataset's CoreInventory tags onto
 * Lexeme.collections, matched by `[lemmaKey, pos, sense]`. Writes that column
 * only — never a topic, concept or Item (B6-SPEC V2-6). A lexeme not in the
 * dataset keeps what it has. Idempotent: only differing rows are written, in
 * chunks of one transaction each.
 */

export const COLLECTIONS_CHUNK_SIZE = 200;

export type SyncCollectionsReport = {
  lexemes: number;
  inDataset: number;
  tagged: number;
  changed: number;
  chunks: number;
};

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export async function syncCollections(
  db: Pick<PrismaClient, 'lexeme' | '$transaction'>,
  dataset: readonly NormalizedLexemeEntry[],
  options: { dryRun?: boolean; lemmaKeyPrefix?: string; chunkSize?: number } = {},
): Promise<SyncCollectionsReport> {
  const byIdentity = new Map(dataset.map((l) => [lexemeIdentity(l), l.collections]));
  const rows = await db.lexeme.findMany({
    where: options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {},
    select: { id: true, lemmaKey: true, pos: true, sense: true, collections: true },
    orderBy: { id: 'asc' },
  });
  const matched = rows.flatMap((r) => {
    const collections = byIdentity.get(lexemeIdentity(r));
    return collections ? [{ id: r.id, before: r.collections, collections }] : [];
  });
  const changed = matched.filter((m) => !same(m.before, m.collections));
  const report: SyncCollectionsReport = {
    lexemes: rows.length,
    inDataset: matched.length,
    tagged: matched.filter((m) => m.collections.length > 0).length,
    changed: changed.length,
    chunks: 0,
  };
  if (options.dryRun) return report;
  const size = options.chunkSize ?? COLLECTIONS_CHUNK_SIZE;
  for (let i = 0; i < changed.length; i += size) {
    await db.$transaction(
      changed
        .slice(i, i + size)
        .map(({ id, collections }) => db.lexeme.update({ where: { id }, data: { collections } })),
    );
    report.chunks += 1;
  }
  return report;
}
