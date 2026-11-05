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
 * With `stopOnRateLimit` (a run under a tight spend limit, B6.4a) a 429 is
 * neither retried by the SDK nor skipped: it stops the run at once — every
 * job is resumable, and a quota error would only repeat on every chunk.
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

/** Options of a caller's own client (tests inject `client`). */
export type CallerClientOptions = {
  client?: Anthropic;
  maxRetries?: number;
  /** A 429 stops the run, without SDK retries (see the file header). */
  stopOnRateLimit?: boolean;
};

/**
 * `fetchImpl` with every 429 marked `x-should-retry: false`, which the SDK
 * obeys: its other retries (408, 409, 5xx, connection errors) stay as they are.
 */
export function withoutRateLimitRetry(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 429) return response;
    const headers = new Headers(response.headers);
    headers.set('x-should-retry', 'false');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/** The caller's client: injected, or a new one with the SDK's retries. */
export function callerClient(options: CallerClientOptions): Anthropic {
  return (
    options.client ??
    new Anthropic({
      maxRetries: options.maxRetries ?? 6,
      ...(options.stopOnRateLimit ? { fetch: withoutRateLimitRetry() } : {}),
    })
  );
}

/**
 * One structured-output call, its failures classified (see the file header).
 * Shared by every offline content job (localization B2.4, examples B6.4a).
 */
export async function callParsed(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { stopOnRateLimit?: boolean } = {},
): Promise<LocalizationCallResult> {
  let response: Awaited<ReturnType<typeof client.messages.parse>>;
  try {
    response = await client.messages.parse(params);
  } catch (error) {
    if (options.stopOnRateLimit && error instanceof Anthropic.APIError && error.status === 429) {
      throw new LocalizationFatalError(
        `Anthropic API 429: ${error.message} (stopped; the run is resumable)`,
      );
    }
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
}

export function createLocalizationCaller(
  options: LocalizationRequestOptions & CallerClientOptions,
): LocalizationCaller {
  const client = callerClient(options);
  return (items) => callParsed(client, buildLocalizationRequest(items, options), options);
}
