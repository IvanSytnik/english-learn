import Anthropic from '@anthropic-ai/sdk';
import type { CefrLevelValue, LexemeExample, PartOfSpeechValue } from '@englishlearn/db/schemas';
import { lexemeIdentity } from '@englishlearn/db/vocab/dataset';
import type { ExamplesSnapshotEntry } from '@englishlearn/db/vocab/examples-snapshot';
import {
  callParsed,
  type LocalizationCallResult,
  LocalizationChunkError,
  type LocalizationUsage,
} from '../localization/client';
import type { LocalizationRequestOptions } from '../localization/prompt';
import { buildExamplesRequest } from './prompt';
import type { ExamplesRequestItem, PendingExamples } from './types';
import { type RejectedExamples, validateExamplesBatch } from './validator';

/**
 * The examples run (B6.4a): lexemes without an entry in the snapshot →
 * chunks → model → per-item validation → `onChunk` (the script writes the
 * snapshot after every chunk). Resumable by construction: what is in the
 * snapshot is never asked again; a rejected word is asked again next run.
 */

export type ExamplesCaller = (
  items: readonly ExamplesRequestItem[],
) => Promise<LocalizationCallResult>;

export function createExamplesCaller(
  options: LocalizationRequestOptions & { client?: Anthropic; maxRetries?: number },
): ExamplesCaller {
  const client = options.client ?? new Anthropic({ maxRetries: options.maxRetries ?? 6 });
  return (items) => callParsed(client, buildExamplesRequest(items, options));
}

/** A published lexeme as the localization snapshot and the dataset know it. */
export type ExamplesSource = {
  lemmaKey: string;
  lemma: string;
  pos: PartOfSpeechValue;
  sense: string;
  cefrLevel: CefrLevelValue;
  topic: string;
  meaning: string;
  examples: readonly LexemeExample[];
};

export const DEFAULT_EXAMPLES_BATCH_SIZE = 20;

/** The chunks a run would send: sources not yet in the snapshot, by level, capped at `limit`. */
export function planExamples(
  sources: readonly ExamplesSource[],
  options: {
    done: ReadonlySet<string>;
    level?: CefrLevelValue;
    limit?: number;
    batchSize?: number;
  },
): { pending: number; selected: number; chunks: PendingExamples[][] } {
  const batchSize = options.batchSize ?? DEFAULT_EXAMPLES_BATCH_SIZE;
  const pending = sources.filter((s) => !options.done.has(lexemeIdentity(s)) && s.examples[0]);
  const selected = pending
    .filter((s) => !options.level || s.cefrLevel === options.level)
    .slice(0, options.limit);
  const chunks: PendingExamples[][] = [];
  for (let i = 0; i < selected.length; i += batchSize) {
    chunks.push(
      selected.slice(i, i + batchSize).map((s, j) => {
        const first = s.examples[0] as LexemeExample;
        return {
          key: String(j + 1),
          lemmaKey: s.lemmaKey,
          lemma: s.lemma,
          pos: s.pos,
          sense: s.sense,
          cefrLevel: s.cefrLevel,
          topic: s.topic,
          meaning: s.meaning,
          existing: s.examples.map((ex) => ex.sentence),
          existingForm: first.clozeTarget,
          base: first.sentence,
        };
      }),
    );
  }
  return { pending: pending.length, selected: selected.length, chunks };
}

export type ExamplesReport = {
  chunks: number;
  accepted: number;
  rejected: number;
  failedChunks: number;
  usage: LocalizationUsage;
};

export async function runExamples(options: {
  chunks: readonly PendingExamples[][];
  call: ExamplesCaller;
  concurrency?: number;
  onChunk: (
    accepted: ExamplesSnapshotEntry[],
    rejected: RejectedExamples[],
    usage: LocalizationUsage,
  ) => void;
  log?: (message: string) => void;
}): Promise<ExamplesReport> {
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }
  const { chunks } = options;
  const report: ExamplesReport = {
    chunks: chunks.length,
    accepted: 0,
    rejected: 0,
    failedChunks: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  const none: LocalizationUsage = { ...report.usage };
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < chunks.length) {
      const index = next++;
      const chunk = chunks[index] as PendingExamples[];
      let result: LocalizationCallResult;
      try {
        result = await options.call(chunk);
      } catch (error) {
        if (!(error instanceof LocalizationChunkError)) {
          stopped = true;
          throw error;
        }
        report.failedChunks += 1;
        const rejected = chunk.map((l) => ({
          lemmaKey: l.lemmaKey,
          pos: l.pos,
          sense: l.sense,
          lemma: l.lemma,
          reasons: [error.message],
        }));
        report.rejected += rejected.length;
        options.onChunk([], rejected, none);
        options.log?.(`chunk ${index + 1}/${chunks.length}: failed (${error.message})`);
        continue;
      }
      for (const key of Object.keys(report.usage) as (keyof LocalizationUsage)[]) {
        report.usage[key] += result.usage[key];
      }
      const { accepted, rejected } = validateExamplesBatch(chunk, result.data);
      report.accepted += accepted.length;
      report.rejected += rejected.length;
      options.onChunk(accepted, rejected, result.usage);
      options.log?.(
        `chunk ${index + 1}/${chunks.length}: ${accepted.length} accepted, ${rejected.length} rejected`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return report;
}

/**
 * Haiku 5.5 list prices per MTok (DECISIONS B2.4): input $0.10, output $0.50;
 * cache reads at 0.1× and cache writes at 1.25× the input price. An estimate.
 */
export function estimateCostUsd(usage: LocalizationUsage): number {
  const input = 0.1;
  return (
    (usage.inputTokens * input +
      usage.outputTokens * 0.5 +
      usage.cacheReadTokens * input * 0.1 +
      usage.cacheWriteTokens * input * 1.25) /
    1_000_000
  );
}
