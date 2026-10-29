import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import {
  applyLexemeLocalizations,
  findLexemesToLocalize,
  type LexemeLocalization,
} from '../queries/lexeme-localization';
import { CefrLevelValue } from '../schemas/learner-events';
import { LexemeExampleSchema, TranslationMapSchema } from '../schemas/lexeme';
import { LocalizedStringSchema } from '../schemas/localized-string';
import { lexemeIdentity } from './dataset';

/**
 * The committed localization snapshot (B2.4): the validated LLM glosses of
 * the CEFR-J lexemes, keyed by the Lexeme unique key `[lemmaKey, pos, sense]`
 * rather than by id, so any database imported from the same dataset — prod,
 * a fresh dev branch, CI — gets the same text without another model call.
 * Applying it is the same DRAFT → REVIEW step as the live run.
 */
export const LOCALIZATION_SNAPSHOT_URL = new URL(
  '../../data/cefr-j-v1.5-localized.json',
  import.meta.url,
);

export const LocalizationSnapshotEntrySchema = z
  .object({
    lemmaKey: z.string().min(1),
    pos: z.string().min(1),
    sense: z.string(),
    cefrLevel: CefrLevelValue,
    definitions: LocalizedStringSchema,
    translations: TranslationMapSchema,
    examples: z.array(LexemeExampleSchema).min(1),
    collocations: z.array(z.string().trim().min(1)),
  })
  .strict();
export type LocalizationSnapshotEntry = z.infer<typeof LocalizationSnapshotEntrySchema>;

export const LocalizationSnapshotSchema = z
  .object({
    source: z.string().min(1),
    model: z.string().min(1),
    exportedAt: z.iso.datetime(),
    entries: z.array(LocalizationSnapshotEntrySchema),
  })
  .strict()
  .refine((s) => new Set(s.entries.map(lexemeIdentity)).size === s.entries.length, {
    message: 'Duplicate [lemmaKey, pos, sense] in the snapshot',
    path: ['entries'],
  });
export type LocalizationSnapshot = z.infer<typeof LocalizationSnapshotSchema>;

export function loadLocalizationSnapshot(
  url: URL = LOCALIZATION_SNAPSHOT_URL,
): LocalizationSnapshot {
  return LocalizationSnapshotSchema.parse(JSON.parse(readFileSync(url, 'utf8')) as unknown);
}

/** Snapshot entries in a stable order, so a re-export of the same data differs only in `exportedAt`. */
export function sortSnapshotEntries(
  entries: readonly LocalizationSnapshotEntry[],
): LocalizationSnapshotEntry[] {
  const key = (e: LocalizationSnapshotEntry) => [e.cefrLevel, e.lemmaKey, e.pos, e.sense];
  return [...entries].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i++) {
      const order = (ka[i] as string).localeCompare(kb[i] as string, 'en');
      if (order !== 0) return order;
    }
    return 0;
  });
}

/**
 * Pairs pending lexemes with their snapshot entry by unique key. A lexeme the
 * snapshot does not cover is returned in `missing` (left for the model run);
 * a level mismatch means the dataset moved on, so the entry is not used.
 */
export function matchSnapshot(
  pending: readonly {
    id: string;
    lemmaKey: string;
    pos: string;
    sense: string;
    cefrLevel: string;
  }[],
  entries: readonly LocalizationSnapshotEntry[],
): { matched: LexemeLocalization[]; missing: number; levelMismatch: number } {
  const byKey = new Map(entries.map((e) => [lexemeIdentity(e), e]));
  const matched: LexemeLocalization[] = [];
  let missing = 0;
  let levelMismatch = 0;
  for (const row of pending) {
    const entry = byKey.get(lexemeIdentity(row));
    if (!entry) missing += 1;
    else if (entry.cefrLevel !== row.cefrLevel) levelMismatch += 1;
    else {
      matched.push({
        id: row.id,
        definitions: entry.definitions,
        translations: entry.translations,
        examples: entry.examples,
        collocations: entry.collocations,
      });
    }
  }
  return { matched, missing, levelMismatch };
}

/** Small enough that a chunk's transaction stays well inside Prisma's 5 s timeout over the pooler. */
const SYNC_CHUNK = 50;

/**
 * Applies the snapshot to the lexemes still DRAFT with no translations, in
 * chunks, through the same DRAFT → REVIEW write as the model run. Idempotent:
 * anything already localized is not pending, so a second run writes nothing.
 */
export async function syncLocalizationSnapshot(
  db: Pick<PrismaClient, 'lexeme' | '$transaction'>,
  entries: readonly LocalizationSnapshotEntry[],
  options: { dryRun?: boolean } = {},
): Promise<{
  pending: number;
  matched: number;
  missing: number;
  levelMismatch: number;
  written: number;
}> {
  const pending = await findLexemesToLocalize(db);
  const { matched, missing, levelMismatch } = matchSnapshot(pending, entries);
  let written = 0;
  if (!options.dryRun) {
    for (let i = 0; i < matched.length; i += SYNC_CHUNK) {
      written += await applyLexemeLocalizations(db, matched.slice(i, i + SYNC_CHUNK));
    }
  }
  return { pending: pending.length, matched: matched.length, missing, levelMismatch, written };
}
