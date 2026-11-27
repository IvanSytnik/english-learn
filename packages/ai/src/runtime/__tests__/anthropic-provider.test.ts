import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createAnthropicProvider,
  MissingRuntimeKeyError,
  RUNTIME_API_KEY_ENV,
} from '../anthropic-provider';
import type { AiRequest } from '../provider';

/**
 * The provider over the real SDK client with a scripted `fetch`: the SDK's
 * own retry, timeout and error classes run as in production, no network.
 */

const Out = z.object({ word: z.string(), ok: z.boolean() });
const request = (
  over: Partial<AiRequest<z.infer<typeof Out>>> = {},
): AiRequest<z.infer<typeof Out>> => ({
  model: 'claude-haiku-5-5',
  system: 'system prompt',
  user: 'user message',
  schema: Out,
  maxTokens: 512,
  ...over,
});

const USAGE = {
  input_tokens: 120,
  output_tokens: 30,
  cache_read_input_tokens: 400,
  cache_creation_input_tokens: 0,
};

function message(text: string, stop_reason = 'end_turn', extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason,
      stop_sequence: null,
      stop_details: null,
      usage: USAGE,
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function status(code: number) {
  return new Response(
    JSON.stringify({ type: 'error', error: { type: 'x', message: `status ${code}` } }),
    {
      status: code,
      headers: { 'content-type': 'application/json', 'retry-after-ms': '1' },
    },
  );
}

/** A fetch that answers with `responses` in order and records each body. */
function scripted(...responses: Array<Response | 'hang'>) {
  const bodies: unknown[] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error('no scripted response left');
    if (next === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    return next;
  });
  return { fetch, bodies };
}

function provider(
  fetch: typeof globalThis.fetch,
  over: { maxRetries?: number; timeoutMs?: number } = {},
) {
  const client = new Anthropic({ apiKey: 'test-key', fetch, maxRetries: over.maxRetries ?? 0 });
  return createAnthropicProvider({ client, timeoutMs: over.timeoutMs ?? 2_000 });
}

describe('createAnthropicProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the validated output and the tokens, with a cached system prompt and the format', async () => {
    const { fetch, bodies } = scripted(message('{"word":"blorf","ok":false}'));
    const result = await provider(fetch).call(request({ effort: 'low' }));
    expect(result).toMatchObject({
      ok: true,
      data: { word: 'blorf', ok: false },
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 400, cacheWriteTokens: 0 },
    });
    const body = bodies[0] as {
      model: string;
      max_tokens: number;
      system: unknown;
      messages: unknown;
      output_config: { format: { type: string }; effort?: string };
    };
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.max_tokens).toBe(512);
    expect(body.system).toEqual([
      { type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.messages).toEqual([{ role: 'user', content: 'user message' }]);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.effort).toBe('low');
  });

  it('output that is not JSON or fails the schema is invalid_output, tokens kept', async () => {
    for (const text of ['not json', '{"word":1}']) {
      const { fetch } = scripted(message(text));
      const result = await provider(fetch).call(request());
      expect(result).toMatchObject({
        ok: false,
        code: 'invalid_output',
        usage: { inputTokens: 120 },
      });
    }
  });

  it('a refusal and a max_tokens stop are results, tokens kept', async () => {
    const refused = scripted(
      message('', 'refusal', {
        stop_details: { type: 'refusal', category: 'general_harms', explanation: null },
      }),
    );
    expect(await provider(refused.fetch).call(request())).toMatchObject({
      ok: false,
      code: 'refused',
      message: 'general_harms',
      usage: { outputTokens: 30 },
    });
    const truncated = scripted(message('{"word":"bl', 'max_tokens'));
    expect(await provider(truncated.fetch).call(request())).toMatchObject({
      ok: false,
      code: 'truncated',
      usage: { outputTokens: 30 },
    });
  });

  it('HTTP errors after the SDK retries: 429 rate_limited, others provider_error, no usage', async () => {
    const limited = scripted(status(429));
    expect(await provider(limited.fetch).call(request())).toMatchObject({
      ok: false,
      code: 'rate_limited',
      usage: null,
    });
    for (const code of [400, 401, 500, 529]) {
      const { fetch } = scripted(status(code));
      expect(await provider(fetch).call(request())).toMatchObject({
        ok: false,
        code: 'provider_error',
        usage: null,
      });
    }
  });

  it('the SDK retries a 529 up to maxRetries (2) and then succeeds', async () => {
    const { fetch } = scripted(status(529), status(529), message('{"word":"x","ok":true}'));
    const result = await provider(fetch, { maxRetries: 2 }).call(request());
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('the deadline covers the whole call, retries included: a hanging request is a timeout', async () => {
    // Each attempt hangs; the SDK alone would time out every attempt after
    // timeoutMs and retry twice with backoff (> 1 s in all).
    const { fetch } = scripted('hang', 'hang', 'hang');
    const started = Date.now();
    const result = await provider(fetch, { timeoutMs: 100, maxRetries: 2 }).call(request());
    expect(result).toMatchObject({ ok: false, code: 'timeout', usage: null });
    expect(Date.now() - started).toBeLessThan(800);
  });

  it("the caller's signal cancels the call: aborted", async () => {
    const { fetch } = scripted('hang');
    const controller = new AbortController();
    const pending = provider(fetch).call(request({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toMatchObject({ ok: false, code: 'aborted', usage: null });
  });

  it('needs the runtime key and never falls back to the scripts key', () => {
    vi.stubEnv(RUNTIME_API_KEY_ENV, undefined);
    vi.stubEnv('ANTHROPIC_API_KEY', 'scripts-key');
    expect(() => createAnthropicProvider()).toThrow(MissingRuntimeKeyError);
    vi.stubEnv(RUNTIME_API_KEY_ENV, 'runtime-key');
    expect(() => createAnthropicProvider()).not.toThrow();
  });
});
