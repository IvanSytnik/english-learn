/**
 * List prices of the models the runtime may call (B6.9), in USD per million
 * tokens — which is the same number as micro-USD per token. A model missing
 * here cannot be called: the cost of every call must be computable before it
 * is made (budget check) and after (AiUsage).
 *
 * Source: Anthropic list prices, checked 2026-11-25. Cache reads are 0.1× and
 * 5-minute cache writes 1.25× the input price. Haiku 5.5 bills prompts over
 * 100K tokens at a higher rate; the runtime's prompts are a few thousand
 * tokens, and `costMicroUsd` applies the long rate when one ever is.
 * Update with any price change — the eval report and AiUsage depend on it.
 */

export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prompts above `threshold` input tokens bill at these rates instead. */
  long?: { threshold: number; input: number; output: number };
};

export const MODEL_PRICES = {
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    long: { threshold: 100_000, input: 0.5, output: 2.5 },
  },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
} as const satisfies Record<string, ModelPrice>;

export type RuntimeModel = keyof typeof MODEL_PRICES;

export function isRuntimeModel(model: string): model is RuntimeModel {
  return Object.hasOwn(MODEL_PRICES, model);
}

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Cost of one call in whole micro-USD, rounded up (a budget never undercounts). */
export function costMicroUsd(model: RuntimeModel, usage: TokenUsage): number {
  const price: ModelPrice = MODEL_PRICES[model];
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const long = price.long && prompt > price.long.threshold ? price.long : undefined;
  const inputRate = long?.input ?? price.input;
  const scale = inputRate / price.input;
  const exact =
    usage.inputTokens * inputRate +
    usage.outputTokens * (long?.output ?? price.output) +
    usage.cacheReadTokens * price.cacheRead * scale +
    usage.cacheWriteTokens * price.cacheWrite * scale;
  return Math.max(0, Math.ceil(exact - 1e-9));
}

/**
 * Upper bound of a call's input tokens from its text, before any tokenizer:
 * one token per 2 characters (English BPE averages ~4). Conservative on
 * purpose — it only decides whether a call may start under the budget.
 */
export function estimateInputTokens(...texts: readonly string[]): number {
  let chars = 0;
  for (const text of texts) chars += text.length;
  return Math.ceil(chars / 2) + 50;
}

/**
 * The most a call can cost: every input token billed as a cache write (the
 * dearest input rate) plus `maxTokens` of output.
 */
export function worstCaseCostMicroUsd(
  model: RuntimeModel,
  inputTokens: number,
  maxTokens: number,
): number {
  return costMicroUsd(model, {
    inputTokens: 0,
    outputTokens: maxTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: inputTokens,
  });
}
