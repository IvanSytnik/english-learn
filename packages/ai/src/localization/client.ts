import Anthropic from '@anthropic-ai/sdk';
import { buildLocalizationRequest, type LocalizationRequestOptions } from './prompt';
import type { LocalizationRequestItem } from './types';

/**
 * The one place the localization pipeline calls the Anthropic API.
 *
 * Retries are the SDK's own: exponential backoff honouring `retry-after` on
 * 408/409/429/5xx (529 overloaded included) and connection errors, up to
 * `maxRetries`. What is left after that is classified here:
 *   - a 4xx other than 429 (bad model id, bad key, bad request) is fatal —
 *     every chunk would fail the same way, so the run stops;
 *   - anything else fails only this chunk (its words stay DRAFT and are
 *     retried by the next run).
 */

export const DEFAULT_LOCALIZATION_MODEL = 'claude-haiku-5-5';

export type LocalizationUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type LocalizationCallResult = { data: unknown; usage: LocalizationUsage };
export type LocalizationCaller = (
  items: readonly LocalizationRequestItem[],
) => Promise<LocalizationCallResult>;

/** The chunk failed; the run goes on. */
export class LocalizationChunkError extends Error {}
/** Every chunk would fail the same way; the run stops. */
export class LocalizationFatalError extends Error {}

export function resolveLocalizationModel(flag?: string): string {
  return flag || process.env.VOCAB_LLM_MODEL || DEFAULT_LOCALIZATION_MODEL;
}

export function createLocalizationCaller(
  options: LocalizationRequestOptions & { client?: Anthropic; maxRetries?: number },
): LocalizationCaller {
  const client = options.client ?? new Anthropic({ maxRetries: options.maxRetries ?? 6 });
  return async (items) => {
    let response: Awaited<ReturnType<typeof client.messages.parse>>;
    try {
      response = await client.messages.parse(buildLocalizationRequest(items, options));
    } catch (error) {
      if (
        error instanceof Anthropic.APIError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw new LocalizationFatalError(`Anthropic API ${error.status}: ${error.message}`);
      }
      throw new LocalizationChunkError(error instanceof Error ? error.message : String(error));
    }
    if (response.stop_reason !== 'end_turn') {
      throw new LocalizationChunkError(`stop_reason ${response.stop_reason}`);
    }
    return {
      data: response.parsed_output,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}
