import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import { PartOfSpeechSchema, type PartOfSpeechValue } from '../schemas/lexeme';
import { type Arpabet, type HeteronymRow, ipaFor } from './ipa';

/**
 * The committed IPA file (B6.4a): `{ lemmaKey: ipa | null }` for every
 * catalogue lemmaKey, derived from CMUdict by scripts/build-ipa-cmudict.ts —
 * never the dictionary itself. A lemmaKey whose lexemes are pronounced
 * differently by part of speech (`record` noun / verb) is in `byPos`
 * instead. The header carries the CMUdict licence (BSD-2-Clause: the
 * copyright notice and disclaimer travel with derived data).
 */
export const IPA_DATA_URL = new URL('../../data/ipa-cmudict-us.json', import.meta.url);

const Ipa = z.string().min(1).nullable();

export const IpaDataSchema = z
  .object({
    source: z
      .object({
        name: z.literal('CMUdict'),
        url: z.url(),
        version: z.string().min(1),
        licence: z.literal('BSD-2-Clause'),
        copyright: z.string().min(1),
        licenceText: z.string().min(1),
        conversion: z.string().min(1),
      })
      .strict(),
    entries: z.record(z.string().min(1), Ipa),
    byPos: z.record(z.string().min(1), z.partialRecord(PartOfSpeechSchema, Ipa)),
  })
  .strict()
  .refine((d) => Object.keys(d.byPos).every((k) => !Object.hasOwn(d.entries, k)), {
    message: 'A lemmaKey is either in entries or in byPos',
    path: ['byPos'],
  });
export type IpaData = z.infer<typeof IpaDataSchema>;

export function loadIpaData(url: URL = IPA_DATA_URL): IpaData {
  return IpaDataSchema.parse(JSON.parse(readFileSync(url, 'utf8')) as unknown);
}

/**
 * The file's entries for a set of lexemes, pure: one IPA per lemmaKey, or
 * per part of speech when they differ.
 */
export function buildIpaEntries(
  lexemes: readonly { lemmaKey: string; pos: PartOfSpeechValue }[],
  dict: ReadonlyMap<string, Arpabet[]>,
  heteronyms: readonly HeteronymRow[],
): Pick<IpaData, 'entries' | 'byPos'> {
  const byKey = new Map<string, Map<PartOfSpeechValue, string | null>>();
  for (const l of lexemes) {
    const m = byKey.get(l.lemmaKey) ?? new Map();
    m.set(l.pos, ipaFor(l.lemmaKey, l.pos, dict, heteronyms).ipa);
    byKey.set(l.lemmaKey, m);
  }
  const entries: IpaData['entries'] = {};
  const byPos: IpaData['byPos'] = {};
  for (const key of [...byKey.keys()].sort()) {
    const m = byKey.get(key) as Map<PartOfSpeechValue, string | null>;
    const values = new Set(m.values());
    if (values.size === 1) entries[key] = [...values][0] ?? null;
    else byPos[key] = Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return { entries, byPos };
}

/** The IPA the file gives a lexeme; undefined when its lemmaKey is not in the file. */
export function ipaOf(
  data: Pick<IpaData, 'entries' | 'byPos'>,
  lexeme: { lemmaKey: string; pos: PartOfSpeechValue },
): string | null | undefined {
  const perPos = Object.hasOwn(data.byPos, lexeme.lemmaKey)
    ? data.byPos[lexeme.lemmaKey]
    : undefined;
  if (perPos) return Object.hasOwn(perPos, lexeme.pos) ? (perPos[lexeme.pos] ?? null) : undefined;
  return Object.hasOwn(data.entries, lexeme.lemmaKey)
    ? (data.entries[lexeme.lemmaKey] ?? null)
    : undefined;
}

export const IPA_CHUNK_SIZE = 1000;

export type SyncIpaReport = {
  lexemes: number;
  /** Lexemes the file knows (their lemmaKey, and part of speech where it matters). */
  inFile: number;
  withIpa: number;
  changed: number;
  chunks: number;
};

/**
 * vocab:sync-ipa: Lexeme.ipa from the file, matched by lemmaKey (and part of
 * speech in `byPos`). A lexeme the file does not know is left alone; null in
 * the file writes null. Only differing rows are written, one
 * `UPDATE … FROM unnest(…)` per chunk (pitfall 190); a re-run writes nothing.
 */
export async function syncIpa(
  db: Pick<PrismaClient, 'lexeme' | '$executeRaw'>,
  data: Pick<IpaData, 'entries' | 'byPos'>,
  options: { dryRun?: boolean; lemmaKeyPrefix?: string; chunkSize?: number } = {},
): Promise<SyncIpaReport> {
  const rows = await db.lexeme.findMany({
    where: options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {},
    select: { id: true, lemmaKey: true, pos: true, ipa: true },
    orderBy: { id: 'asc' },
  });
  const report: SyncIpaReport = {
    lexemes: rows.length,
    inFile: 0,
    withIpa: 0,
    changed: 0,
    chunks: 0,
  };
  const changed: { id: string; ipa: string | null }[] = [];
  for (const r of rows) {
    const ipa = ipaOf(data, r);
    if (ipa === undefined) continue;
    report.inFile += 1;
    if (ipa !== null) report.withIpa += 1;
    if (r.ipa !== ipa) changed.push({ id: r.id, ipa });
  }
  report.changed = changed.length;
  if (options.dryRun) return report;
  const size = options.chunkSize ?? IPA_CHUNK_SIZE;
  for (let i = 0; i < changed.length; i += size) {
    const chunk = changed.slice(i, i + size);
    await db.$executeRaw`
      UPDATE "public"."Lexeme" AS l
      SET "ipa" = v.ipa
      FROM unnest(${chunk.map((c) => c.id)}::text[], ${chunk.map((c) => c.ipa)}::text[]) AS v(id, ipa)
      WHERE l."id" = v.id`;
    report.chunks += 1;
  }
  return report;
}
