import { readFileSync } from 'node:fs';
import { PartOfSpeechSchema } from '@englishlearn/db/schemas';
import { z } from 'zod';
import { type LexemeGenOutcome, LexemeGenRejectReasonSchema } from '../../src/lexeme-gen';
import type { LexemeGenRequestItem } from '../../src/lexeme-gen/types';

/**
 * The lexeme generation eval (B6.9): the golden set, its batching and the
 * deterministic scoring of one model's outcomes. Pure — `run.ts` calls the
 * model and writes the results.
 */

const GoldenExpectSchema = z.discriminatedUnion('word', [
  z
    .object({
      word: z.literal(true),
      /** Any entry's lemma must be one of these. */
      lemma: z.array(z.string().min(1)).optional(),
      /** Any entry's pos must be one of these. */
      pos: z.array(PartOfSpeechSchema).optional(),
    })
    .strict(),
  z
    .object({
      word: z.literal(false),
      reasons: z.array(LexemeGenRejectReasonSchema).min(1),
      /** For a misspelling: the expected suggestion. */
      suggestion: z.string().min(1).optional(),
    })
    .strict(),
]);

const GoldenCaseSchema = z
  .object({
    input: z.string().min(1),
    category: z.string().regex(/^[a-z_]+$/),
    expect: GoldenExpectSchema,
    note: z.string().optional(),
  })
  .strict();
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export const GoldenSetSchema = z
  .object({ version: z.number().int(), note: z.string(), cases: z.array(GoldenCaseSchema).min(1) })
  .strict();
export type GoldenSet = z.infer<typeof GoldenSetSchema>;

export const GOLDEN_PATH = new URL('./golden.json', import.meta.url);

export function loadGoldenSet(path: URL = GOLDEN_PATH): GoldenSet {
  return GoldenSetSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** FNV-1a — a stable order independent of the file's category grouping. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export type EvalBatch = { cases: GoldenCase[]; items: LexemeGenRequestItem[] };

/**
 * Batches of `size` (B6.10 sends ≤ 10 per call), categories interleaved by a
 * stable hash so no batch is "all offensive" — the model must judge each
 * candidate on its own, as with a real paste. Keys are "1".."n" per batch.
 */
export function batchCases(cases: readonly GoldenCase[], size: number): EvalBatch[] {
  const ordered = [...cases].sort(
    (a, b) => fnv1a(a.input) - fnv1a(b.input) || (a.input < b.input ? -1 : 1),
  );
  const batches: EvalBatch[] = [];
  for (let i = 0; i < ordered.length; i += size) {
    const slice = ordered.slice(i, i + size);
    batches.push({
      cases: slice,
      items: slice.map((c, j) => ({ key: String(j + 1), input: c.input })),
    });
  }
  return batches;
}

export type CaseScore = { pass: boolean; failures: string[] };

export function scoreCase(golden: GoldenCase, outcome: LexemeGenOutcome): CaseScore {
  const failures: string[] = [];
  const { expect } = golden;
  if (outcome.kind === 'invalid') {
    failures.push(`invalid output: ${outcome.problems.slice(0, 3).join('; ')}`);
  } else if (expect.word) {
    if (outcome.kind === 'rejected') {
      failures.push(`rejected as ${outcome.reason}, expected a word`);
    } else {
      const lemmas = outcome.entries.map((e) => e.lemma);
      const poses = outcome.entries.map((e) => e.pos);
      if (expect.lemma && !lemmas.some((l) => expect.lemma?.includes(l))) {
        failures.push(`lemma ${lemmas.join('/')}, expected ${expect.lemma.join(' or ')}`);
      }
      if (expect.pos && !poses.some((p) => expect.pos?.includes(p))) {
        failures.push(`pos ${poses.join('/')}, expected ${expect.pos.join(' or ')}`);
      }
    }
  } else if (outcome.kind === 'entries') {
    failures.push(
      `generated ${outcome.entries.map((e) => e.lemma).join('/')}, expected a rejection`,
    );
  } else {
    if (!expect.reasons.includes(outcome.reason)) {
      failures.push(`rejected as ${outcome.reason}, expected ${expect.reasons.join(' or ')}`);
    }
    if (expect.suggestion && outcome.suggestion?.toLowerCase() !== expect.suggestion) {
      failures.push(`suggestion ${outcome.suggestion ?? 'none'}, expected ${expect.suggestion}`);
    }
  }
  return { pass: failures.length === 0, failures };
}

export type CategoryTally = { passed: number; total: number };

export function tallyByCategory(
  scored: readonly { category: string; pass: boolean }[],
): Record<string, CategoryTally> {
  const tally: Record<string, CategoryTally> = {};
  for (const { category, pass } of scored) {
    const row = tally[category] ?? { passed: 0, total: 0 };
    tally[category] = row;
    row.total += 1;
    if (pass) row.passed += 1;
  }
  return Object.fromEntries(Object.entries(tally).sort(([a], [b]) => a.localeCompare(b)));
}
