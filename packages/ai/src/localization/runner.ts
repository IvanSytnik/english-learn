import type { LexemeLocalization } from '@englishlearn/db/queries/lexeme-localization';
import { type LocalizationCaller, LocalizationChunkError, type LocalizationUsage } from './client';
import type { BatchLocalizationItem, PendingLexeme } from './types';
import { type RejectedItem, validateLocalizedBatch } from './validator';

/**
 * The localization run: pending lexemes → chunks → model → per-item
 * validation → one DRAFT → REVIEW transaction per chunk. Resumable by
 * construction: the store only returns what is still DRAFT with no gloss, so
 * an interrupted run is finished by running it again.
 */

export type PendingRow = Omit<PendingLexeme, 'key' | 'topic'> & { lemmaKey: string };

export type LocalizationStore = {
  findPending(): Promise<PendingRow[]>;
  /** Writes one chunk transactionally; returns the rows written. */
  apply(localizations: LexemeLocalization[]): Promise<number>;
};

export type LocalizationRunOptions = {
  store: LocalizationStore;
  call: LocalizationCaller;
  topicOf: (row: PendingRow) => string | undefined;
  batchSize?: number;
  concurrency?: number;
  limit?: number;
  topic?: string;
  onRejected?: (items: RejectedItem[]) => void;
  log?: (message: string) => void;
};

export type LocalizationReport = {
  pending: number;
  selected: number;
  chunks: number;
  written: number;
  rejected: number;
  failedChunks: number;
  usage: LocalizationUsage;
};

export const DEFAULT_BATCH_SIZE = 20;
export const DEFAULT_CONCURRENCY = 3;

const toLocalization = (item: BatchLocalizationItem): LexemeLocalization => ({
  id: item.id,
  definitions: item.definitions,
  translations: item.translations,
  examples: item.examples,
  collocations: item.collocations,
});

/**
 * The chunks a run would send: pending rows with their topic, filtered by
 * topic, capped at `limit`, keyed "1".."N" within each chunk.
 */
export function planLocalization(
  pending: readonly PendingRow[],
  options: Pick<LocalizationRunOptions, 'topicOf' | 'batchSize' | 'limit' | 'topic'>,
): { selected: number; chunks: PendingLexeme[][] } {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const selected = pending
    .map((row) => ({ row, topic: options.topicOf(row) ?? 'general' }))
    .filter(({ topic }) => !options.topic || topic === options.topic)
    .slice(0, options.limit);
  const chunks: PendingLexeme[][] = [];
  for (let i = 0; i < selected.length; i += batchSize) {
    chunks.push(
      selected.slice(i, i + batchSize).map(({ row, topic }, j) => ({
        id: row.id,
        key: String(j + 1),
        lemma: row.lemma,
        pos: row.pos,
        sense: row.sense,
        cefrLevel: row.cefrLevel,
        topic,
      })),
    );
  }
  return { selected: selected.length, chunks };
}

export async function runLocalization(
  options: LocalizationRunOptions,
): Promise<LocalizationReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error(`batchSize must be 1..50, got ${batchSize}`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const pending = await options.store.findPending();
  const { selected, chunks } = planLocalization(pending, options);

  const report: LocalizationReport = {
    pending: pending.length,
    selected,
    chunks: chunks.length,
    written: 0,
    rejected: 0,
    failedChunks: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  const reject = (items: RejectedItem[]) => {
    if (items.length === 0) return;
    report.rejected += items.length;
    options.onRejected?.(items);
  };

  let next = 0;
  // A fatal error stops every worker from taking another chunk.
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < chunks.length) {
      const index = next++;
      const chunk = chunks[index] as PendingLexeme[];
      let result: Awaited<ReturnType<LocalizationCaller>>;
      try {
        result = await options.call(chunk);
      } catch (error) {
        if (!(error instanceof LocalizationChunkError)) {
          stopped = true;
          throw error;
        }
        report.failedChunks += 1;
        reject(chunk.map((l) => ({ id: l.id, lemma: l.lemma, reasons: [error.message] })));
        options.log?.(`chunk ${index + 1}/${chunks.length}: failed (${error.message})`);
        continue;
      }
      for (const key of Object.keys(report.usage) as (keyof LocalizationUsage)[]) {
        report.usage[key] += result.usage[key];
      }
      const { accepted, rejected } = validateLocalizedBatch(chunk, result.data);
      const written = await options.store.apply(accepted.map(toLocalization));
      report.written += written;
      reject(rejected);
      options.log?.(
        `chunk ${index + 1}/${chunks.length}: ${written} written, ${rejected.length} rejected`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return report;
}
