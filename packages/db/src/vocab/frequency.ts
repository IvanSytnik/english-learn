import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';

/**
 * vocab:sync-frequency (B6.2): wordfreq Zipf frequency onto Lexeme.
 *
 * - `frequencyZipf` = the committed value for the lexeme's lemmaKey
 *   (packages/db/data/frequency-wordfreq-en.json, scripts/vocab-frequency.py);
 *   0 or missing → null. Written on every lexeme, whatever its status.
 * - `frequencyRank` = dense rank by zipf DESC over the PUBLISHED lexemes with
 *   a frequency, ties broken by lemmaKey ASC: 1, 2, 3 … with no gaps; the
 *   lexemes of one lemmaKey (`march` noun / verb) share a rank because they
 *   share a zipf. Not PUBLISHED or no frequency → null.
 * - Idempotent: only rows whose values differ are written — one
 *   `UPDATE … FROM unnest(…)` statement per chunk (atomic on its own, one
 *   round trip: per-row updates in a transaction over the Neon pooler ran
 *   past Prisma's 5 s transaction timeout, pitfall 190).
 */

export const FrequencyDatasetSchema = z
  .object({
    source: z
      .object({
        name: z.literal('wordfreq'),
        version: z.string().min(1),
        licence: z.literal('CC BY-SA 4.0'),
        attribution: z.string().min(1),
      })
      .strict(),
    entries: z.record(z.string().min(1), z.number().min(0).max(8)),
  })
  .strict();
export type FrequencyDataset = z.infer<typeof FrequencyDatasetSchema>;

export const FREQUENCY_DATASET_URL = new URL(
  '../../data/frequency-wordfreq-en.json',
  import.meta.url,
);

export function loadFrequencyDataset(): FrequencyDataset {
  return FrequencyDatasetSchema.parse(
    JSON.parse(readFileSync(FREQUENCY_DATASET_URL, 'utf8')) as unknown,
  );
}

export type FrequencyRow = {
  id: string;
  lemmaKey: string;
  status: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

export type FrequencyValues = {
  id: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

/** Target values for every row, pure. */
export function planFrequency(
  rows: readonly FrequencyRow[],
  zipfByKey: Readonly<Record<string, number>>,
): FrequencyValues[] {
  const zipfOf = (lemmaKey: string): number | null => {
    const z = Object.hasOwn(zipfByKey, lemmaKey) ? zipfByKey[lemmaKey] : undefined;
    return z === undefined || z <= 0 ? null : z;
  };
  const ranked = [
    ...new Map(
      rows
        .filter((r) => r.status === 'PUBLISHED' && zipfOf(r.lemmaKey) !== null)
        .map((r) => [r.lemmaKey, zipfOf(r.lemmaKey) as number]),
    ),
  ].sort(([ak, az], [bk, bz]) => bz - az || (ak < bk ? -1 : ak > bk ? 1 : 0));
  const rankByKey = new Map(ranked.map(([key], i) => [key, i + 1]));
  return rows.map((r) => ({
    id: r.id,
    frequencyZipf: zipfOf(r.lemmaKey),
    frequencyRank: r.status === 'PUBLISHED' ? (rankByKey.get(r.lemmaKey) ?? null) : null,
  }));
}

export const FREQUENCY_CHUNK_SIZE = 1000;

export type SyncFrequencyReport = {
  lexemes: number;
  withFrequency: number;
  ranked: number;
  /** Rows whose values differ (written unless dry run). */
  changed: number;
  chunks: number;
};

export async function syncFrequency(
  db: Pick<PrismaClient, 'lexeme' | '$executeRaw'>,
  dataset: FrequencyDataset,
  options: { dryRun?: boolean; lemmaKeyPrefix?: string; chunkSize?: number } = {},
): Promise<SyncFrequencyReport> {
  const rows = await db.lexeme.findMany({
    where: options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {},
    select: { id: true, lemmaKey: true, status: true, frequencyZipf: true, frequencyRank: true },
    orderBy: { id: 'asc' },
  });
  const plan = planFrequency(rows, dataset.entries);
  const before = new Map(rows.map((r) => [r.id, r]));
  const changed = plan.filter((p) => {
    const r = before.get(p.id);
    return r?.frequencyZipf !== p.frequencyZipf || r?.frequencyRank !== p.frequencyRank;
  });
  const report: SyncFrequencyReport = {
    lexemes: rows.length,
    withFrequency: plan.filter((p) => p.frequencyZipf !== null).length,
    ranked: plan.filter((p) => p.frequencyRank !== null).length,
    changed: changed.length,
    chunks: 0,
  };
  if (options.dryRun) return report;
  const size = options.chunkSize ?? FREQUENCY_CHUNK_SIZE;
  for (let i = 0; i < changed.length; i += size) {
    const chunk = changed.slice(i, i + size);
    await db.$executeRaw`
      UPDATE "public"."Lexeme" AS l
      SET "frequencyZipf" = v.zipf, "frequencyRank" = v.rank
      FROM unnest(
        ${chunk.map((c) => c.id)}::text[],
        ${chunk.map((c) => c.frequencyZipf)}::double precision[],
        ${chunk.map((c) => c.frequencyRank)}::integer[]
      ) AS v(id, zipf, rank)
      WHERE l."id" = v.id`;
    report.chunks += 1;
  }
  return report;
}
