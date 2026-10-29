import type { PrismaClient } from '../generated/client/client';
import type { LexemeItemContent } from '../schemas/items/lexeme-item';
import type { CefrLevelValue } from '../schemas/learner-events';
import { LexemeSchema } from '../schemas/lexeme';
import { lexemeIdentity } from './dataset';
import type { NormalizedLexemeEntry } from './normalize';
import { vocabConceptId } from './topics';

/**
 * vocab:publish — the explicit admin action that makes reviewed lexemes
 * practisable: Lexeme REVIEW -> PUBLISHED plus one VOCAB_WORD Item per lexeme
 * (the unit of memory FSRS schedules), attached to its topic concept
 * `vocab.<topic>.<level>`.
 *
 * - The topic comes from the CEFR-J dataset by `[lemmaKey, pos, sense]` (the
 *   database has no topic column); afterwards Item.conceptId keeps it.
 * - Fails loudly, before any write: a lexeme missing from the dataset, a
 *   missing topic concept, or a lexeme that is not a complete LexemeSchema row
 *   with at least one example (mode 3 needs a sentence).
 * - Items have no practice question (`hasPractice = false`, enforced by CHECK
 *   Item_lexeme_not_practisable) — grammar selection never sees them.
 * - Idempotent: items are created with skipDuplicates on the partial unique
 *   index (one VOCAB_WORD item per lexeme), lexemes move with
 *   `updateMany where status = REVIEW`. A re-run writes nothing and repairs a
 *   PUBLISHED lexeme that has no item.
 * - Chunks, one transaction each: a lexeme is never PUBLISHED without its item.
 */

export const PUBLISH_CHUNK_SIZE = 250;

export type PublishVocabOptions = {
  /** Publish one level only. */
  level?: CefrLevelValue;
  /** Validate and count, write nothing. */
  dryRun?: boolean;
  /** First segment of the topic concept ids (`vocab`); tests use their own. */
  conceptPrefix?: string;
  /** Only lexemes whose lemmaKey starts with this (tests). */
  lemmaKeyPrefix?: string;
  chunkSize?: number;
};

export type PublishVocabReport = {
  /** REVIEW lexemes moved to PUBLISHED. */
  published: number;
  /** Items created (published + repaired). */
  itemsCreated: number;
  /** PUBLISHED lexemes that had no item. */
  repaired: number;
  chunks: number;
  /** Lexemes per target concept. */
  perConcept: Map<string, number>;
};

export class VocabPublishError extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[],
  ) {
    super(`${message} (${problems.length}): ${problems.slice(0, 10).join('; ')}`);
    this.name = 'VocabPublishError';
  }
}

type Candidate = {
  id: string;
  status: 'REVIEW' | 'PUBLISHED';
  cefrLevel: CefrLevelValue;
  conceptId: string;
  content: LexemeItemContent;
};

export async function publishVocab(
  db: PrismaClient,
  dataset: readonly NormalizedLexemeEntry[],
  options: PublishVocabOptions = {},
): Promise<PublishVocabReport> {
  const prefix = options.conceptPrefix ?? 'vocab';
  const chunkSize = options.chunkSize ?? PUBLISH_CHUNK_SIZE;
  const byIdentity = new Map(dataset.map((l) => [lexemeIdentity(l), l]));

  const rows = await db.lexeme.findMany({
    where: {
      ...(options.level ? { cefrLevel: options.level } : {}),
      ...(options.lemmaKeyPrefix ? { lemmaKey: { startsWith: options.lemmaKeyPrefix } } : {}),
      OR: [{ status: 'REVIEW' }, { status: 'PUBLISHED', items: { none: { kind: 'VOCAB_WORD' } } }],
    },
    orderBy: { id: 'asc' },
  });

  const problems: string[] = [];
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const label = `${row.lemma} (${row.pos}${row.sense ? `, ${row.sense}` : ''})`;
    const entry = byIdentity.get(lexemeIdentity(row));
    if (!entry) {
      problems.push(`${label}: not in the CEFR-J dataset`);
      continue;
    }
    const { createdAt: _c, updatedAt: _u, ...fields } = row;
    const parsed = LexemeSchema.safeParse(fields);
    if (!parsed.success) {
      problems.push(`${label}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    if (parsed.data.examples.length === 0) {
      problems.push(`${label}: no example sentence`);
      continue;
    }
    candidates.push({
      id: row.id,
      status: row.status === 'REVIEW' ? 'REVIEW' : 'PUBLISHED',
      cefrLevel: row.cefrLevel,
      conceptId: vocabConceptId(entry.topic, row.cefrLevel, prefix),
      content: { headword: row.lemma, variants: entry.variants },
    });
  }
  if (problems.length > 0) throw new VocabPublishError('Lexemes cannot be published', problems);

  const conceptIds = [...new Set(candidates.map((c) => c.conceptId))];
  const existing = await db.concept.findMany({
    where: { id: { in: conceptIds } },
    select: { id: true },
  });
  const known = new Set(existing.map((c) => c.id));
  const missing = conceptIds.filter((id) => !known.has(id));
  if (missing.length > 0) throw new VocabPublishError('Topic concepts are missing', missing);

  const perConcept = new Map<string, number>();
  for (const c of candidates) perConcept.set(c.conceptId, (perConcept.get(c.conceptId) ?? 0) + 1);
  const report: PublishVocabReport = {
    published: 0,
    itemsCreated: 0,
    repaired: 0,
    chunks: 0,
    perConcept,
  };
  if (options.dryRun) {
    report.published = candidates.filter((c) => c.status === 'REVIEW').length;
    report.repaired = candidates.length - report.published;
    return report;
  }

  for (let start = 0; start < candidates.length; start += chunkSize) {
    const chunk = candidates.slice(start, start + chunkSize);
    const result = await db.$transaction(
      async (tx) => {
        const items = await tx.item.createMany({
          data: chunk.map((c) => ({
            conceptId: c.conceptId,
            kind: 'VOCAB_WORD' as const,
            cefrLevel: c.cefrLevel,
            status: 'PUBLISHED' as const,
            content: c.content,
            hasPractice: false,
            lexemeId: c.id,
          })),
          skipDuplicates: true,
        });
        const lexemes = await tx.lexeme.updateMany({
          where: { id: { in: chunk.map((c) => c.id) }, status: 'REVIEW' },
          data: { status: 'PUBLISHED' },
        });
        return { items: items.count, published: lexemes.count };
      },
      { timeout: 30_000 },
    );
    report.itemsCreated += result.items;
    report.published += result.published;
    report.chunks += 1;
  }
  report.repaired = candidates.filter((c) => c.status === 'PUBLISHED').length;
  return report;
}
