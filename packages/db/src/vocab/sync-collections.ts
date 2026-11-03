import type { PrismaClient } from '../generated/client/client';
import { lexemeIdentity } from './dataset';
import type { NormalizedLexemeEntry } from './normalize';

/**
 * vocab:sync-collections (B6.2): the dataset's CoreInventory tags onto
 * Lexeme.collections, matched by `[lemmaKey, pos, sense]`. Writes that column
 * only — never a topic, concept or Item (B6-SPEC V2-6). A lexeme not in the
 * dataset keeps what it has. Idempotent: only differing rows are written,
 * one `updateMany` per distinct tag set (a few dozen statements, each atomic;
 * no long transaction over the pooler, pitfall 190).
 */

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
  db: Pick<PrismaClient, 'lexeme'>,
  dataset: readonly NormalizedLexemeEntry[],
  options: { dryRun?: boolean; lemmaKeyPrefix?: string } = {},
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
  const bySet = new Map<string, { collections: string[]; ids: string[] }>();
  for (const { id, collections } of changed) {
    const key = collections.join(',');
    const group = bySet.get(key) ?? { collections: [...collections], ids: [] };
    group.ids.push(id);
    bySet.set(key, group);
  }
  for (const { collections, ids } of bySet.values()) {
    await db.lexeme.updateMany({ where: { id: { in: ids } }, data: { collections } });
    report.chunks += 1;
  }
  return report;
}
