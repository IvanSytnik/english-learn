import { describe, expect, it } from 'vitest';
import {
  costMicroUsd,
  estimateInputTokens,
  isRuntimeModel,
  MODEL_PRICES,
  worstCaseCostMicroUsd,
  ZERO_USAGE,
} from '../prices';

describe('runtime prices', () => {
  it('Haiku 5.5 at list prices, in whole micro-USD rounded up', () => {
    // 1 000 in × 0.1 + 2 000 out × 0.5 + 10 000 cache read × 0.01 + 100 write × 0.125
    expect(
      costMicroUsd('claude-haiku-5-5', {
        inputTokens: 1_000,
        outputTokens: 2_000,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 100,
      }),
    ).toBe(100 + 1_000 + 100 + 13);
    expect(costMicroUsd('claude-haiku-5-5', { ...ZERO_USAGE, inputTokens: 1 })).toBe(1);
    expect(costMicroUsd('claude-haiku-5-5', ZERO_USAGE)).toBe(0);
  });

  it('Sonnet 5.5 is 20× Haiku on input and output', () => {
    const usage = { ...ZERO_USAGE, inputTokens: 1_000, outputTokens: 1_000 };
    expect(costMicroUsd('claude-sonnet-5-5', usage)).toBe(12_000);
    expect(costMicroUsd('claude-haiku-5-5', usage)).toBe(600);
  });

  it('Haiku bills a prompt over 100K tokens at the long rate', () => {
    const at = (inputTokens: number) =>
      costMicroUsd('claude-haiku-5-5', { ...ZERO_USAGE, inputTokens, outputTokens: 1_000 });
    expect(at(100_000)).toBe(10_000 + 500);
    expect(at(100_001)).toBe(Math.ceil(100_001 * 0.5) + 2_500);
  });

  it('the worst case bounds every outcome with the same input and max_tokens', () => {
    const worst = worstCaseCostMicroUsd('claude-haiku-5-5', 2_000, 4_000);
    for (const usage of [
      { ...ZERO_USAGE, inputTokens: 2_000, outputTokens: 4_000 },
      { ...ZERO_USAGE, cacheWriteTokens: 2_000, outputTokens: 4_000 },
      { ...ZERO_USAGE, cacheReadTokens: 1_500, inputTokens: 500, outputTokens: 4_000 },
    ]) {
      expect(costMicroUsd('claude-haiku-5-5', usage)).toBeLessThanOrEqual(worst);
    }
  });

  it('the input estimate over-counts English text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(40);
    // ~4 characters per token for English: the estimate must be well above.
    expect(estimateInputTokens(text)).toBeGreaterThan(text.length / 4);
  });

  it('only priced models are runtime models', () => {
    expect(isRuntimeModel('claude-haiku-5-5')).toBe(true);
    expect(isRuntimeModel('claude-opus-5-5')).toBe(false);
    expect(Object.keys(MODEL_PRICES)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
  });
});
