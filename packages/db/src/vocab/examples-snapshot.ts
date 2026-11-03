import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import { type LexemeExample, LexemeExampleSchema } from '../schemas/lexeme';
import { lexemeIdentity } from './dataset';
import { normalizeSentence } from './example-checks';

/**
 * The committed examples snapshot (B6.4a): two extra validated example
 * sentences per lexeme from the examples job (packages/ai), keyed by the
 * Lexeme unique key `[lemmaKey, pos, sense]` like the localization snapshot.
 * `base` is the lexeme's examples[0] sentence the pair was generated
 * against — vocab:sync-examples appends only while it is still there, so a
 * reviewed first example is never shuffled away.
 *
 * Generation writes only this file and its rejections file; the database
 * gets the sentences through vocab:sync-examples (dev first, prod after the
 * spot check).
 */
export const EXAMPLES_SNAPSHOT_URL = new URL(
  '../../data/cefr-j-v1.5-examples.json',
  import.meta.url,
);
export const EXAMPLES_REJECTED_URL = new URL(
  '../../data/cefr-j-v1.5-examples.rejected.json',
  import.meta.url,
);

const FullTranslation = z
  .object({
    ru: z.string().trim().min(1),
    uk: z.string().trim().min(1),
    de: z.string().trim().min(1),
  })
  .strict();

/** A generated example: the stored example shape, glossed in all three languages. */
export const GeneratedExampleSchema = LexemeExampleSchema.and(
  z.object({ translation: FullTranslation }),
);

const UsageSchema = z
  .object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    cacheReadTokens: z.number().int().min(0),
    cacheWriteTokens: z.number().int().min(0),
  })
  .strict();
export type ExamplesUsage = z.infer<typeof UsageSchema>;

export const ExamplesSnapshotEntrySchema = z
  .object({
    lemmaKey: z.string().min(1),
    pos: z.string().min(1),
    sense: z.string(),
    base: z.string().trim().min(1),
    examples: z.array(GeneratedExampleSchema).length(2),
  })
  .strict();
export type ExamplesSnapshotEntry = z.infer<typeof ExamplesSnapshotEntrySchema>;

export const ExamplesSnapshotSchema = z
  .object({
    source: z
      .object({
        job: z.literal('examples'),
        model: z.string().min(1),
        prompt: z.string().min(1),
        updatedAt: z.iso.datetime(),
        /** Tokens of every run that wrote into this file, summed. */
        usage: UsageSchema,
      })
      .strict(),
    entries: z.array(ExamplesSnapshotEntrySchema),
  })
  .strict()
  .refine((s) => new Set(s.entries.map(lexemeIdentity)).size === s.entries.length, {
    message: 'Duplicate [lemmaKey, pos, sense] in the snapshot',
    path: ['entries'],
  });
export type ExamplesSnapshot = z.infer<typeof ExamplesSnapshotSchema>;

export const ExamplesRejectedSchema = z
  .object({
    updatedAt: z.iso.datetime(),
    entries: z.array(
      z
        .object({
          lemmaKey: z.string().min(1),
          pos: z.string().min(1),
          sense: z.string(),
          lemma: z.string().min(1),
          reasons: z.array(z.string().min(1)).min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type ExamplesRejected = z.infer<typeof ExamplesRejectedSchema>;

export function loadExamplesSnapshot(url: URL = EXAMPLES_SNAPSHOT_URL): ExamplesSnapshot {
  return ExamplesSnapshotSchema.parse(JSON.parse(readFileSync(url, 'utf8')) as unknown);
}

/** Entries in identity order, one per line — a re-run diffs by word, not by file. */
export function serializeExamplesSnapshot(snapshot: ExamplesSnapshot): string {
  const entries = [...snapshot.entries].sort((a, b) =>
    lexemeIdentity(a) < lexemeIdentity(b) ? -1 : 1,
  );
  const lines = entries.map((e) => `    ${JSON.stringify(e)}`);
  return `{\n  "source": ${JSON.stringify(snapshot.source)},\n  "entries": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export const EXAMPLES_CHUNK_SIZE = 500;

export type SyncExamplesReport = {
  inSnapshot: number;
  /** Snapshot entries with no lexeme of that key in the database. */
  missing: number;
  /** examples[0] is no longer the sentence the pair was generated against: left alone. */
  baseChanged: string[];
  /** Rows whose examples would grow (written unless dry run). */
  changed: number;
  examplesAdded: number;
  written: number;
  chunks: number;
};

/**
 * Appends each entry's examples to its lexeme, after the ones it has —
 * examples[0] keeps its index and text, so the cards built today do not
 * change (B6.5 starts using the rest). A sentence already there (by
 * normalizeSentence) is not added again: a re-run writes nothing. Every
 * resulting example passes LexemeExampleSchema before anything is written.
 * One `UPDATE … FROM unnest(…)` statement per chunk (pitfall 190); a row
 * whose examples changed since they were read is not written (`written` <
 * `changed` tells), and the next run picks it up again.
 */
export async function syncExamples(
  db: Pick<PrismaClient, 'lexeme' | '$executeRaw'>,
  snapshot: ExamplesSnapshot,
  options: { dryRun?: boolean; lemmaKeyPrefix?: string; chunkSize?: number } = {},
): Promise<SyncExamplesReport> {
  const entries = options.lemmaKeyPrefix
    ? snapshot.entries.filter((e) => e.lemmaKey.startsWith(options.lemmaKeyPrefix as string))
    : snapshot.entries;
  const rows = await db.lexeme.findMany({
    where: options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {},
    select: { id: true, lemmaKey: true, pos: true, sense: true, examples: true },
  });
  const byKey = new Map(rows.map((r) => [lexemeIdentity(r), r]));
  const report: SyncExamplesReport = {
    inSnapshot: entries.length,
    missing: 0,
    baseChanged: [],
    changed: 0,
    examplesAdded: 0,
    written: 0,
    chunks: 0,
  };
  const writes: { id: string; before: unknown; examples: LexemeExample[] }[] = [];
  for (const entry of entries) {
    const row = byKey.get(lexemeIdentity(entry));
    if (!row) {
      report.missing += 1;
      continue;
    }
    const current = z.array(LexemeExampleSchema).parse(row.examples);
    if (current[0]?.sentence !== entry.base) {
      report.baseChanged.push(
        `${entry.lemmaKey} ${entry.pos}${entry.sense ? ` (${entry.sense})` : ''}`,
      );
      continue;
    }
    const seen = new Set(current.map((ex) => normalizeSentence(ex.sentence)));
    const added = entry.examples.filter((ex) => {
      const key = normalizeSentence(ex.sentence);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (added.length === 0) continue;
    writes.push({
      id: row.id,
      before: row.examples,
      examples: z.array(LexemeExampleSchema).parse([...current, ...added]),
    });
    report.examplesAdded += added.length;
  }
  report.changed = writes.length;
  if (options.dryRun) return report;
  const size = options.chunkSize ?? EXAMPLES_CHUNK_SIZE;
  for (let i = 0; i < writes.length; i += size) {
    const chunk = writes.slice(i, i + size);
    report.written += await db.$executeRaw`
      UPDATE "public"."Lexeme" AS l
      SET "examples" = v.examples::jsonb
      FROM unnest(
        ${chunk.map((w) => w.id)}::text[],
        ${chunk.map((w) => JSON.stringify(w.before))}::text[],
        ${chunk.map((w) => JSON.stringify(w.examples))}::text[]
      ) AS v(id, before, examples)
      WHERE l."id" = v.id AND l."examples" = v.before::jsonb`;
    report.chunks += 1;
  }
  return report;
}
