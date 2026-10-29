import type { PrismaClient } from '../generated/client/client';
import type { CefrLevelValue } from '../schemas/learner-events';
import { CreateDraftLexemeInputSchema } from '../schemas/lexeme';
import type { NormalizedLexemeEntry } from './normalize';
import { getVocabTopic, type VocabTopicId, vocabConceptId } from './topics';

/**
 * The CEFR-J import's database writes: topic Concepts (VOCAB, one per topic ×
 * level), the RELATED edges between a topic's levels, and DRAFT Lexemes.
 *
 * - No Item is written: a word's question is defined with the practice modes
 *   (B2.5), so the import cannot reach the selection pool.
 * - Idempotent: a re-run writes only what changed. It updates only the
 *   columns the source owns (lemma, cefrLevel, cefrJLevel) and never status,
 *   definitions, translations or examples — review and the translation
 *   pipeline are not undone.
 * - Lexemes go in chunks, one transaction per chunk.
 */

export const IMPORT_CHUNK_SIZE = 250;

const LEVELS: readonly CefrLevelValue[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type ImportCefrJOptions = {
  /** First segment of the topic concept ids (`vocab`); tests use their own. */
  conceptPrefix?: string;
  chunkSize?: number;
};

export type ImportCefrJReport = {
  concepts: { created: number; total: number };
  edges: { created: number; total: number };
  lexemes: { created: number; updated: number; unchanged: number };
  chunks: number;
};

export async function importCefrJ(
  db: PrismaClient,
  lexemes: readonly NormalizedLexemeEntry[],
  options: ImportCefrJOptions = {},
): Promise<ImportCefrJReport> {
  const prefix = options.conceptPrefix ?? 'vocab';
  const chunkSize = options.chunkSize ?? IMPORT_CHUNK_SIZE;

  const levelsByTopic = new Map<VocabTopicId, Set<CefrLevelValue>>();
  for (const l of lexemes) {
    const levels = levelsByTopic.get(l.topic) ?? new Set();
    levels.add(l.cefrLevel);
    levelsByTopic.set(l.topic, levels);
  }

  const concepts = [...levelsByTopic].flatMap(([topicId, levels]) => {
    const topic = getVocabTopic(topicId);
    return LEVELS.filter((level) => levels.has(level)).map((level) => ({
      id: vocabConceptId(topicId, level, prefix),
      name: `Vocabulary: ${topic.title.en} (${level})`,
      title: topic.title,
      cefrLevel: level,
      category: 'VOCAB' as const,
    }));
  });

  // Adjacent levels of one topic, lower → higher. RELATED only: a vocabulary
  // concept is never a PREREQUISITE parent (V4).
  const edges = [...levelsByTopic].flatMap(([topicId, levels]) => {
    const ids = LEVELS.filter((level) => levels.has(level)).map((level) =>
      vocabConceptId(topicId, level, prefix),
    );
    return ids
      .slice(1)
      .map((toId, i) => ({ fromId: ids[i] as string, toId, kind: 'RELATED' as const }));
  });

  const graph = await db.$transaction(async (tx) => {
    const existing = await tx.concept.count({ where: { id: { in: concepts.map((c) => c.id) } } });
    for (const { id, ...data } of concepts) {
      await tx.concept.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    const createdEdges = await tx.conceptEdge.createMany({ data: edges, skipDuplicates: true });
    return { conceptsCreated: concepts.length - existing, edgesCreated: createdEdges.count };
  });

  const report: ImportCefrJReport = {
    concepts: { created: graph.conceptsCreated, total: concepts.length },
    edges: { created: graph.edgesCreated, total: edges.length },
    lexemes: { created: 0, updated: 0, unchanged: 0 },
    chunks: 0,
  };

  for (let start = 0; start < lexemes.length; start += chunkSize) {
    const chunk = lexemes.slice(start, start + chunkSize);
    const result = await db.$transaction(async (tx) => writeLexemeChunk(tx, chunk), {
      timeout: 30_000,
    });
    report.lexemes.created += result.created;
    report.lexemes.updated += result.updated;
    report.lexemes.unchanged += result.unchanged;
    report.chunks += 1;
  }
  return report;
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const keyOf = (l: { lemmaKey: string; pos: string; sense: string }) =>
  `${l.lemmaKey}\u0000${l.pos}\u0000${l.sense}`;

async function writeLexemeChunk(tx: Tx, chunk: readonly NormalizedLexemeEntry[]) {
  const stored = await tx.lexeme.findMany({
    where: { lemmaKey: { in: [...new Set(chunk.map((l) => l.lemmaKey))] } },
    select: {
      id: true,
      lemma: true,
      lemmaKey: true,
      pos: true,
      sense: true,
      cefrLevel: true,
      cefrJLevel: true,
    },
  });
  const byKey = new Map(stored.map((row) => [keyOf(row), row]));

  const fresh = chunk
    .filter((l) => !byKey.has(keyOf(l)))
    .map(({ lemma, pos, sense, cefrLevel, cefrJLevel }) =>
      CreateDraftLexemeInputSchema.parse({
        lemma,
        pos,
        sense,
        cefrLevel,
        cefrJLevel,
        definitions: {},
        translations: {},
      }),
    );
  const created = await tx.lexeme.createMany({ data: fresh, skipDuplicates: true });

  let updated = 0;
  for (const l of chunk) {
    const row = byKey.get(keyOf(l));
    if (!row) continue;
    if (row.lemma === l.lemma && row.cefrLevel === l.cefrLevel && row.cefrJLevel === l.cefrJLevel) {
      continue;
    }
    await tx.lexeme.update({
      where: { id: row.id },
      data: { lemma: l.lemma, cefrLevel: l.cefrLevel, cefrJLevel: l.cefrJLevel },
    });
    updated += 1;
  }
  return { created: created.count, updated, unchanged: chunk.length - fresh.length - updated };
}
