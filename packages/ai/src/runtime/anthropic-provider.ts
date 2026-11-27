import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { TokenUsage } from './prices';
import type { AiProvider, AiRequest, CallErrorCode, ProviderResult } from './provider';

/**
 * The Anthropic implementation of the runtime provider (B6.9).
 *
 * - **Key:** `ANTHROPIC_RUNTIME_API_KEY` only (V2-7: a runtime key separate
 *   from the scripts key, each with its own spend limit). There is no
 *   fallback to `ANTHROPIC_API_KEY` — the scripts key never serves users.
 * - **Deadline:** `timeoutMs` (20 s) is the whole call, the SDK's retries
 *   included; the caller's `signal` cancels it earlier.
 * - **Retries:** the SDK's (`maxRetries: 2`, backoff honouring
 *   `retry-after` on 408/409/429/5xx and connection errors).
 * - **Output:** `output_config.format` from the request's Zod schema; the
 *   text is parsed and validated here, not by `messages.parse`, so a call
 *   whose output fails validation still reports the tokens it was billed.
 * - **Refusal:** `stop_reason: "refusal"` is a result (`refused`), not an
 *   error to retry elsewhere — no server-side fallback model is configured.
 */

export const RUNTIME_API_KEY_ENV = 'ANTHROPIC_RUNTIME_API_KEY';
export const RUNTIME_TIMEOUT_MS = 20_000;
export const RUNTIME_MAX_RETRIES = 2;

export type AnthropicProviderOptions = {
  /** Tests inject a client; otherwise one is built from the runtime key. */
  client?: Anthropic;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injectable clock for latency (tests). */
  now?: () => number;
};

export class MissingRuntimeKeyError extends Error {
  constructor() {
    super(`${RUNTIME_API_KEY_ENV} is not set: the AI runtime has no key`);
  }
}

function usageOf(response: Anthropic.Message): TokenUsage {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): AiProvider {
  const timeoutMs = options.timeoutMs ?? RUNTIME_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  let client = options.client;
  if (!client) {
    const apiKey = options.apiKey ?? process.env[RUNTIME_API_KEY_ENV];
    if (!apiKey) throw new MissingRuntimeKeyError();
    client = new Anthropic({
      apiKey,
      timeout: timeoutMs,
      maxRetries: options.maxRetries ?? RUNTIME_MAX_RETRIES,
    });
  }
  const sdk = client;

  return {
    async call<T>(request: AiRequest<T>): Promise<ProviderResult<T>> {
      const started = now();
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
      const fail = (
        code: CallErrorCode,
        message: string,
        usage: TokenUsage | null,
      ): ProviderResult<T> => ({ ok: false, code, message, usage, latencyMs: now() - started });

      let response: Anthropic.Message;
      try {
        response = await sdk.messages.create(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: request.user }],
            output_config: {
              format: zodOutputFormat(request.schema),
              ...(request.effort ? { effort: request.effort } : {}),
            },
          },
          { signal, timeout: timeoutMs },
        );
      } catch (error) {
        return fail(...classify(error, request.signal, deadline), null);
      }

      const usage = usageOf(response);
      if (response.stop_reason === 'refusal') {
        return fail('refused', response.stop_details?.category ?? 'refusal', usage);
      }
      if (response.stop_reason === 'max_tokens') {
        return fail('truncated', `max_tokens ${request.maxTokens} reached`, usage);
      }
      let json: unknown;
      try {
        json = JSON.parse(textOf(response));
      } catch {
        return fail('invalid_output', 'output is not JSON', usage);
      }
      const parsed = request.schema.safeParse(json);
      if (!parsed.success) {
        return fail('invalid_output', parsed.error.message.slice(0, 500), usage);
      }
      return { ok: true, data: parsed.data, usage, latencyMs: now() - started };
    },
  };
}

/** A thrown SDK error → the runtime's code. Most specific class first. */
export function classify(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  deadline: AbortSignal,
): [CallErrorCode, string] {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Anthropic.APIUserAbortError) {
    if (callerSignal?.aborted) return ['aborted', 'cancelled by the caller'];
    if (deadline.aborted) return ['timeout', 'deadline reached'];
    return ['aborted', message];
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return ['timeout', message];
  if (error instanceof Anthropic.RateLimitError) return ['rate_limited', message];
  if (error instanceof Anthropic.APIError) {
    return ['provider_error', `${error.status ?? 'connection'}: ${message}`.slice(0, 500)];
  }
  if (callerSignal?.aborted) return ['aborted', 'cancelled by the caller'];
  if (deadline.aborted) return ['timeout', 'deadline reached'];
  return ['provider_error', message.slice(0, 500)];
}
