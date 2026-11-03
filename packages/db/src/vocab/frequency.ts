import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import type { CefrLevelValue } from '../schemas/learner-events';
import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * vocab:sync-frequency (B6.2): wordfreq Zipf frequency onto Lexeme.
 *
 * - `frequencyZipf` = the committed value for the lexeme's lemmaKey
 *   (packages/db/data/frequency-wordfreq-en.json, scripts/vocab-frequency.py);
 *   0 or missing → null. Written on every lexeme, whatever its status.
 * - `frequencyRank` = dense rank over the PUBLISHED lexemes with a frequency
 *   by the key `[closedClass ASC, secondarySense ASC, zipf DESC, lemmaKey
 *   ASC]` (B6.2a rank amendment): 1, 2, 3 … with no gaps. wordfreq counts a
 *   form, not a sense, so a rare sense of a frequent form (`go` noun B1) and
 *   function words (`to`, `of`) would otherwise lead the NEW tier. Content
 *   words come first, then the second senses of a form, then closed-class
 *   words. Not PUBLISHED or no frequency → null.
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

/**
 * Closed-class parts of speech: ranked after every content word. The
 * catalogue tags numbers and determiners `OTHER`. Interjections (`please`,
 * `thanks`, `hello`) are content for a learner — they are not here.
 */
export const CLOSED_CLASS_POS: ReadonlySet<PartOfSpeechValue> = new Set<PartOfSpeechValue>([
  'PREPOSITION',
  'CONJUNCTION',
  'PRONOUN',
  'OTHER',
]);

/**
 * Which sense of a form is primary when two PUBLISHED lexemes of one
 * lemmaKey share the lowest CEFR level: the first by this order (the most
 * frequent part of speech of an English form), then the rest.
 */
export const PRIMARY_POS_ORDER: readonly PartOfSpeechValue[] = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PHRASAL_VERB',
  'IDIOM',
  'INTERJECTION',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'OTHER',
];

const CEFR_ORDER: readonly CefrLevelValue[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type FrequencyRow = {
  id: string;
  lemmaKey: string;
  pos: PartOfSpeechValue;
  sense: string;
  cefrLevel: CefrLevelValue;
  status: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

export type FrequencyValues = {
  id: string;
  frequencyZipf: number | null;
  frequencyRank: number | null;
};

/**
 * The primary sense of each lemmaKey among the PUBLISHED rows: the lowest
 * CEFR level, then PRIMARY_POS_ORDER, then sense and id — exactly one per
 * lemmaKey; every other PUBLISHED row of that key is a secondary sense.
 */
export function primarySenseIds(rows: readonly FrequencyRow[]): Set<string> {
  const best = new Map<string, FrequencyRow>();
  const order = (r: FrequencyRow) =>
    [CEFR_ORDER.indexOf(r.cefrLevel), PRIMARY_POS_ORDER.indexOf(r.pos)] as const;
  for (const r of rows) {
    if (r.status !== 'PUBLISHED') continue;
    const b = best.get(r.lemmaKey);
    if (!b) {
      best.set(r.lemmaKey, r);
      continue;
    }
    const [rl, rp] = order(r);
    const [bl, bp] = order(b);
    const better =
      rl !== bl
        ? rl < bl
        : rp !== bp
          ? rp < bp
          : r.sense !== b.sense
            ? r.sense < b.sense
            : r.id < b.id;
    if (better) best.set(r.lemmaKey, r);
  }
  return new Set([...best.values()].map((r) => r.id));
}

/** Target values for every row, pure. */
export function planFrequency(
  rows: readonly FrequencyRow[],
  zipfByKey: Readonly<Record<string, number>>,
): FrequencyValues[] {
  const zipfOf = (lemmaKey: string): number | null => {
    const z = Object.hasOwn(zipfByKey, lemmaKey) ? zipfByKey[lemmaKey] : undefined;
    return z === undefined || z <= 0 ? null : z;
  };
  const primary = primarySenseIds(rows);
  type Key = readonly [closed: number, secondary: number, zipf: number, lemmaKey: string];
  const keyOf = (r: FrequencyRow): Key => [
    CLOSED_CLASS_POS.has(r.pos) ? 1 : 0,
    primary.has(r.id) ? 0 : 1,
    zipfOf(r.lemmaKey) as number,
    r.lemmaKey,
  ];
  const id = (k: Key) => k.join('\u0000');
  const keys = [
    ...new Map(
      rows
        .filter((r) => r.status === 'PUBLISHED' && zipfOf(r.lemmaKey) !== null)
        .map((r) => {
          const k = keyOf(r);
          return [id(k), k] as const;
        }),
    ).values(),
  ].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || b[2] - a[2] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0),
  );
  const rankOf = new Map(keys.map((k, i) => [id(k), i + 1]));
  return rows.map((r) => {
    const frequencyZipf = zipfOf(r.lemmaKey);
    return {
      id: r.id,
      frequencyZipf,
      frequencyRank:
        r.status === 'PUBLISHED' && frequencyZipf !== null
          ? (rankOf.get(id(keyOf(r))) ?? null)
          : null,
    };
  });
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
    select: {
      id: true,
      lemmaKey: true,
      pos: true,
      sense: true,
      cefrLevel: true,
      status: true,
      frequencyZipf: true,
      frequencyRank: true,
    },
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
