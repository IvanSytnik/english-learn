// packages/ai/evals/lexeme-gen/run.ts
//
// Runs the lexeme generation prompt over the golden set (B6.9) and writes one
// result file per model to results/<model>.json plus results/summary.md —
// committed, so a re-run shows up as a diff to review. Run manually before
// any prompt, model or provider change (B6-SPEC §6). Costs real money: the
// default plan prints its worst case first; --dry-run stops there.
//
// Calls go through the runtime provider exactly as B6.10 will (same deadline,
// retries, structured output), but not through runAiCall: no DB, no AiUsage,
// no flags — the cost is reported here instead.
//
// Usage (from packages/ai; the key from the environment, never a flag value):
//   pnpm eval:lexeme-gen --dry-run
//   pnpm eval:lexeme-gen --models claude-haiku-5-5,claude-sonnet-5-5
//   options: --effort low|medium|high · --batch 10 · --timeout-ms 20000
//            --key-env ANTHROPIC_RUNTIME_API_KEY · --concurrency 2

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  buildLexemeGenRequest,
  LEXEME_GEN_BATCH_MAX,
  LEXEME_GEN_PROMPT_VERSION,
  type LexemeGenOutcome,
  validateLexemeGenBatch,
} from '../../src/lexeme-gen';
import {
  createAnthropicProvider,
  RUNTIME_API_KEY_ENV,
  RUNTIME_TIMEOUT_MS,
} from '../../src/runtime/anthropic-provider';
import {
  costMicroUsd,
  estimateInputTokens,
  isRuntimeModel,
  type RuntimeModel,
  type TokenUsage,
  worstCaseCostMicroUsd,
  ZERO_USAGE,
} from '../../src/runtime/prices';
import type { AiEffort, ProviderResult } from '../../src/runtime/provider';
import { batchCases, type EvalBatch, loadGoldenSet, scoreCase, tallyByCategory } from './harness';

const RESULTS = new URL('./results/', import.meta.url);

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: 'claude-haiku-5-5' },
    effort: { type: 'string' },
    batch: { type: 'string', default: String(LEXEME_GEN_BATCH_MAX) },
    'timeout-ms': { type: 'string', default: String(RUNTIME_TIMEOUT_MS) },
    'key-env': { type: 'string', default: RUNTIME_API_KEY_ENV },
    concurrency: { type: 'string', default: '2' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

function parseModels(list: string): RuntimeModel[] {
  return list.split(',').map((m) => {
    const model = m.trim();
    if (!isRuntimeModel(model)) throw new Error(`Unknown or unpriced model: ${model}`);
    return model;
  });
}

function parseEffort(value: string | undefined): AiEffort | undefined {
  if (value === undefined) return undefined;
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw new Error(`--effort must be low, medium or high, got ${value}`);
}

type CaseResult = {
  input: string;
  category: string;
  pass: boolean;
  failures: string[];
  outcome: LexemeGenOutcome;
  /** The model's answer for this candidate as it came (null when the call failed). */
  raw: unknown;
};

type BatchResult = {
  cases: CaseResult[];
  usage: TokenUsage;
  costMicroUsd: number;
  latencyMs: number;
  error: string | null;
};

async function runBatch(
  batch: EvalBatch,
  call: (b: EvalBatch) => Promise<ProviderResult<unknown>>,
  model: RuntimeModel,
  worstCase: number,
): Promise<BatchResult> {
  const result = await call(batch);
  const data = result.ok ? result.data : null;
  const outcomes = result.ok
    ? validateLexemeGenBatch(batch.items, data)
    : batch.items.map(
        (item): LexemeGenOutcome => ({
          ...item,
          kind: 'invalid',
          problems: [`call failed: ${result.code} (${result.message})`],
        }),
      );
  const rawItems = new Map<string, unknown>();
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    for (const item of (data as { items: { key?: unknown }[] }).items) {
      if (typeof item?.key === 'string') rawItems.set(item.key, item);
    }
  }
  return {
    cases: batch.cases.map((golden, i) => {
      const outcome = outcomes[i] as LexemeGenOutcome;
      return {
        input: golden.input,
        category: golden.category,
        ...scoreCase(golden, outcome),
        outcome,
        raw: rawItems.get(batch.items[i]?.key ?? '') ?? null,
      };
    }),
    usage: result.usage ?? ZERO_USAGE,
    costMicroUsd: result.usage ? costMicroUsd(model, result.usage) : worstCase,
    latencyMs: result.latencyMs,
    error: result.ok ? null : `${result.code}: ${result.message}`,
  };
}

async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main(): Promise<void> {
  const models = parseModels(values.models);
  const effort = parseEffort(values.effort);
  const size = Number(values.batch);
  const timeoutMs = Number(values['timeout-ms']);
  const concurrency = Number(values.concurrency);
  if (!(size >= 1 && size <= LEXEME_GEN_BATCH_MAX))
    throw new Error(`--batch 1..${LEXEME_GEN_BATCH_MAX}`);

  const golden = loadGoldenSet();
  const batches = batchCases(golden.cases, size);
  const plan = models.map((model) => {
    const worst = batches.reduce((sum, b) => {
      const request = buildLexemeGenRequest(b.items, { model, effort });
      return (
        sum +
        worstCaseCostMicroUsd(
          model,
          estimateInputTokens(request.system, request.user),
          request.maxTokens,
        )
      );
    }, 0);
    return { model, worst };
  });
  console.log(
    `Golden set v${golden.version}: ${golden.cases.length} cases, ${batches.length} calls per model ` +
      `(batch ${size}), prompt ${LEXEME_GEN_PROMPT_VERSION}, effort ${effort ?? 'model default'}, ` +
      `deadline ${timeoutMs} ms`,
  );
  for (const p of plan) console.log(`  ${p.model}: worst case ${usd(p.worst)}`);
  if (values['dry-run']) return;

  const apiKey = process.env[values['key-env']];
  if (!apiKey) throw new Error(`${values['key-env']} is not set`);
  const provider = createAnthropicProvider({ apiKey, timeoutMs });
  mkdirSync(RESULTS, { recursive: true });

  const summaryRows: string[] = [];
  for (const { model } of plan) {
    const results = await pool(batches, concurrency, (b) => {
      const request = buildLexemeGenRequest(b.items, { model, effort });
      const worst = worstCaseCostMicroUsd(
        model,
        estimateInputTokens(request.system, request.user),
        request.maxTokens,
      );
      return runBatch(b, () => provider.call(request), model, worst);
    });
    const cases = results.flatMap((r) => r.cases);
    const usage = results.reduce<TokenUsage>(
      (sum, r) => ({
        inputTokens: sum.inputTokens + r.usage.inputTokens,
        outputTokens: sum.outputTokens + r.usage.outputTokens,
        cacheReadTokens: sum.cacheReadTokens + r.usage.cacheReadTokens,
        cacheWriteTokens: sum.cacheWriteTokens + r.usage.cacheWriteTokens,
      }),
      ZERO_USAGE,
    );
    const cost = results.reduce((sum, r) => sum + r.costMicroUsd, 0);
    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const passed = cases.filter((c) => c.pass).length;
    const byCategory = tallyByCategory(cases);
    const report = {
      model,
      promptVersion: LEXEME_GEN_PROMPT_VERSION,
      goldenVersion: golden.version,
      effort: effort ?? null,
      batchSize: size,
      timeoutMs,
      ranAt: new Date().toISOString(),
      passed,
      total: cases.length,
      byCategory,
      usage,
      costMicroUsd: cost,
      latencyMs: {
        max: latencies.at(-1) ?? 0,
        median: latencies[Math.floor(latencies.length / 2)] ?? 0,
      },
      callErrors: results.map((r) => r.error).filter((e) => e !== null),
      cases: [...cases].sort(
        (a, b) => a.category.localeCompare(b.category) || a.input.localeCompare(b.input),
      ),
    };
    writeFileSync(new URL(`${model}.json`, RESULTS), `${JSON.stringify(report, null, 2)}\n`);

    console.log(
      `\n${model}: ${passed}/${cases.length} passed · ${usd(cost)} · latency max ${report.latencyMs.max} ms`,
    );
    for (const [category, t] of Object.entries(byCategory))
      console.log(`  ${category}: ${t.passed}/${t.total}`);
    for (const c of cases.filter((x) => !x.pass))
      console.log(`  ✗ ${c.input} — ${c.failures.join('; ')}`);
    for (const e of report.callErrors) console.log(`  call error: ${e}`);

    summaryRows.push(
      `| ${model} | ${report.effort ?? 'default'} | ${passed}/${cases.length} | ` +
        Object.entries(byCategory)
          .map(([k, t]) => `${k} ${t.passed}/${t.total}`)
          .join(' · ') +
        ` | ${usd(cost)} | ${report.latencyMs.median} / ${report.latencyMs.max} | ${report.callErrors.length} |`,
    );
  }

  writeFileSync(
    new URL('summary.md', RESULTS),
    [
      `# Lexeme generation eval — prompt ${LEXEME_GEN_PROMPT_VERSION}, golden v${golden.version}`,
      '',
      `Ran ${new Date().toISOString().slice(0, 10)} · batch ${size} · deadline ${timeoutMs} ms. Per-case outputs: \`<model>.json\`.`,
      '',
      '| Model | Effort | Passed | By category | Cost | Latency median / max, ms | Call errors |',
      '|---|---|---|---|---|---|---|',
      ...summaryRows,
      '',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
