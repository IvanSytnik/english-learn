// packages/ai/scripts/generate-examples.ts
//
// The examples job (B6.4a): two more validated example sentences for every
// published CEFR-J lexeme, for its exact part of speech and meaning, with
// cloze targets and ru/uk/de translations. Offline: the input is the
// committed localization snapshot (what prod and dev were synced from) and
// the dataset; the output goes ONLY to the committed examples snapshot
// packages/db/data/cefr-j-v1.5-examples.json and its rejections file — the
// database gets the sentences through `pnpm --filter @englishlearn/db
// vocab:sync-examples`. Resumable: a word in the snapshot is never asked
// again; a rejected word is asked again by the next run. The snapshot is
// rewritten after every chunk.
//
// Usage (from packages/ai; ANTHROPIC_API_KEY from packages/db/.env):
//   pnpm vocab:examples --dry-run --limit 40   # counts + first prompt, no API
//   pnpm vocab:examples --limit 40             # pilot
//   pnpm vocab:examples [--level A1|A2|B1|B2] [--model …] [--batch-size 20] [--concurrency 3]

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CefrLevelValue, type CefrLevelValue as Level } from '@englishlearn/db/schemas';
import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { easyWordShare } from '@englishlearn/db/vocab/example-checks';
import {
  EXAMPLES_REJECTED_URL,
  EXAMPLES_SNAPSHOT_URL,
  type ExamplesRejected,
  ExamplesRejectedSchema,
  type ExamplesSnapshot,
  ExamplesSnapshotSchema,
  serializeExamplesSnapshot,
} from '@englishlearn/db/vocab/examples-snapshot';
import { loadLocalizationSnapshot } from '@englishlearn/db/vocab/localization-snapshot';
import { z } from 'zod';
import {
  buildExamplesUserPrompt,
  createExamplesCaller,
  DEFAULT_EXAMPLES_BATCH_SIZE,
  EXAMPLES_PROMPT_VERSION,
  type ExamplesSource,
  estimateCostUsd,
  planExamples,
  runExamples,
} from '../src/examples';
import { resolveLocalizationModel } from '../src/localization';

const ArgsSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  'batch-size': z.coerce.number().int().min(1).max(50).default(DEFAULT_EXAMPLES_BATCH_SIZE),
  concurrency: z.coerce.number().int().min(1).max(10).default(3),
  level: CefrLevelValue.optional(),
  model: z.string().min(1).optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  'dry-run': z.boolean().default(false),
});

const emptyUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Write next to the file, then rename: an interrupted write never leaves half a snapshot. */
function writeAtomic(url: URL, text: string): void {
  const tmp = new URL(`${url.href}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, url);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      'batch-size': { type: 'string' },
      concurrency: { type: 'string' },
      level: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const args = ArgsSchema.parse(values);
  const model = resolveLocalizationModel(args.model);

  const dataset = new Map(loadCefrJDataset().lexemes.map((l) => [lexemeIdentity(l), l]));
  const levelOf = new Map<string, Level>();
  for (const l of dataset.values()) {
    const known = levelOf.get(l.lemmaKey);
    if (!known || l.cefrLevel < known) levelOf.set(l.lemmaKey, l.cefrLevel);
  }
  const sources: ExamplesSource[] = loadLocalizationSnapshot().entries.map((e) => {
    const entry = dataset.get(lexemeIdentity(e));
    if (!entry) throw new Error(`${e.lemmaKey} ${e.pos} is not in the dataset`);
    return {
      lemmaKey: e.lemmaKey,
      lemma: entry.lemma,
      pos: entry.pos,
      sense: e.sense,
      cefrLevel: e.cefrLevel,
      topic: entry.topic,
      meaning: e.definitions.en,
      examples: e.examples,
    };
  });

  let snapshot: ExamplesSnapshot = existsSync(EXAMPLES_SNAPSHOT_URL)
    ? ExamplesSnapshotSchema.parse(JSON.parse(readFileSync(EXAMPLES_SNAPSHOT_URL, 'utf8')))
    : {
        source: {
          job: 'examples',
          model,
          prompt: EXAMPLES_PROMPT_VERSION,
          updatedAt: new Date().toISOString(),
          usage: { ...emptyUsage },
        },
        entries: [],
      };
  if (snapshot.source.prompt !== EXAMPLES_PROMPT_VERSION || snapshot.source.model !== model) {
    throw new Error(
      `The snapshot was made with ${snapshot.source.model} / prompt ${snapshot.source.prompt}; ` +
        `this run uses ${model} / ${EXAMPLES_PROMPT_VERSION}. One snapshot, one model and prompt.`,
    );
  }
  let rejectedFile: ExamplesRejected = existsSync(EXAMPLES_REJECTED_URL)
    ? ExamplesRejectedSchema.parse(JSON.parse(readFileSync(EXAMPLES_REJECTED_URL, 'utf8')))
    : { updatedAt: new Date().toISOString(), entries: [] };

  const done = new Set(snapshot.entries.map(lexemeIdentity));
  const plan = planExamples(sources, {
    done,
    level: args.level,
    limit: args.limit,
    batchSize: args['batch-size'],
  });
  console.log(
    `${sources.length} published lexemes, ${done.size} in the snapshot, ${plan.pending} pending; ` +
      `${plan.selected} selected in ${plan.chunks.length} chunks · model ${model} · prompt ${EXAMPLES_PROMPT_VERSION}`,
  );
  if (args['dry-run']) {
    const [first] = plan.chunks;
    if (first) console.log(`\nFirst prompt:\n${buildExamplesUserPrompt(first)}`);
    console.log('Dry run: no API call, nothing written.');
    return;
  }

  const reasons = new Map<string, number>();
  const shares: number[] = [];
  const report = await runExamples({
    chunks: plan.chunks,
    call: createExamplesCaller({ model, effort: args.effort }),
    concurrency: args.concurrency,
    onChunk: (accepted, rejected, usage) => {
      const now = new Date().toISOString();
      const fixed = new Set(accepted.map(lexemeIdentity));
      const failed = new Map(rejected.map((r) => [lexemeIdentity(r), r]));
      snapshot = {
        source: {
          ...snapshot.source,
          updatedAt: now,
          usage: Object.fromEntries(
            Object.entries(snapshot.source.usage).map(([k, v]) => [
              k,
              v + usage[k as keyof typeof usage],
            ]),
          ) as typeof snapshot.source.usage,
        },
        entries: [...snapshot.entries, ...accepted],
      };
      rejectedFile = {
        updatedAt: now,
        entries: [
          ...rejectedFile.entries.filter((r) => {
            const key = lexemeIdentity(r);
            return !fixed.has(key) && !failed.has(key);
          }),
          ...failed.values(),
        ].sort((a, b) => (lexemeIdentity(a) < lexemeIdentity(b) ? -1 : 1)),
      };
      writeAtomic(EXAMPLES_SNAPSHOT_URL, serializeExamplesSnapshot(snapshot));
      writeAtomic(EXAMPLES_REJECTED_URL, `${JSON.stringify(rejectedFile, null, 2)}\n`);
      for (const r of rejected) {
        for (const reason of r.reasons) {
          const kind = reason.replace(/examples\.\d/g, 'examples.N').replace(/"[^"]*"/g, '"…"');
          reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
        }
      }
      for (const a of accepted) {
        const level = dataset.get(lexemeIdentity(a))?.cefrLevel ?? 'A1';
        for (const ex of a.examples) {
          shares.push(easyWordShare(ex.sentence, level, (k) => levelOf.get(k)));
        }
      }
    },
    log: (message) => console.log(message),
  });

  console.log(
    `\n${report.accepted} accepted, ${report.rejected} rejected (${report.failedChunks} failed chunks); ` +
      `snapshot now ${snapshot.entries.length}, outstanding rejections ${rejectedFile.entries.length}.`,
  );
  for (const [reason, n] of [...reasons].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${n} × ${reason}`);
  }
  const u = report.usage;
  console.log(
    `Tokens this run: ${u.inputTokens} in, ${u.outputTokens} out, cache read ${u.cacheReadTokens}, ` +
      `cache write ${u.cacheWriteTokens} · ≈ $${estimateCostUsd(u).toFixed(3)} (Haiku list prices).`,
  );
  if (shares.length > 0) {
    const sorted = [...shares].sort((a, b) => a - b);
    const mean = shares.reduce((s, x) => s + x, 0) / shares.length;
    const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
    console.log(
      `Easy-word share (catalogue level ≤ word level + 1; soft): mean ${(mean * 100).toFixed(1)} %, ` +
        `p10 ${(p10 * 100).toFixed(1)} %, ${shares.length} sentences.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
