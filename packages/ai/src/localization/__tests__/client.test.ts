import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExamplesCaller } from '../../examples';
import {
  callParsed,
  createLocalizationCaller,
  LocalizationChunkError,
  LocalizationFatalError,
  resolveLocalizationModel,
  withoutRateLimitRetry,
} from '../client';
import type { LocalizationRequestItem } from '../types';

const items: LocalizationRequestItem[] = [
  { key: '1', lemma: 'apple', pos: 'NOUN', sense: '', cefrLevel: 'A1', topic: 'food_drink' },
];

const fakeClient = (parse: (params: unknown) => Promise<unknown>) =>
  ({ messages: { parse: vi.fn(parse) } }) as unknown as Anthropic;

const reply = (extra: Record<string, unknown> = {}) => ({
  stop_reason: 'end_turn',
  parsed_output: { items: [] },
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 0,
  },
  ...extra,
});

describe('createLocalizationCaller', () => {
  it('sends the built request and maps the usage', async () => {
    const client = fakeClient(async () => reply());
    const call = createLocalizationCaller({ client, model: 'claude-haiku-5-5', effort: 'low' });
    await expect(call(items)).resolves.toEqual({
      data: { items: [] },
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 0 },
    });
    const params = vi.mocked(client.messages.parse).mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
  });

  it.each(['max_tokens', 'refusal'])('fails the chunk on stop_reason %s', async (stop_reason) => {
    const call = createLocalizationCaller({
      client: fakeClient(async () => reply({ stop_reason })),
      model: 'm',
    });
    await expect(call(items)).rejects.toThrow(LocalizationChunkError);
  });

  it('stops the run on a non-retryable 4xx', async () => {
    const call = createLocalizationCaller({
      client: fakeClient(async () => {
        throw new Anthropic.BadRequestError(400, undefined, 'model not found', new Headers());
      }),
      model: 'm',
    });
    await expect(call(items)).rejects.toThrow(LocalizationFatalError);
  });

  it.each([
    [
      '429 after retries',
      () => new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()),
    ],
    [
      '529 after retries',
      () => new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers()),
    ],
    ['a malformed response', () => new SyntaxError('Unexpected token')],
  ])('fails only the chunk on %s', async (_, error) => {
    const call = createLocalizationCaller({
      client: fakeClient(async () => {
        throw error();
      }),
      model: 'm',
    });
    await expect(call(items)).rejects.toThrow(LocalizationChunkError);
  });
});

describe('stopOnRateLimit (B6.4a spend cap)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const rateLimited = () =>
    new Response(
      JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'quota' } }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after-ms': '0' } },
    );
  const params = {
    model: 'm',
    max_tokens: 10,
    messages: [{ role: 'user' as const, content: 'x' }],
  };

  it('turns a 429 into a stop of the run', async () => {
    const client = fakeClient(async () => {
      throw new Anthropic.RateLimitError(429, undefined, 'quota', new Headers());
    });
    await expect(callParsed(client, params, { stopOnRateLimit: true })).rejects.toThrow(
      LocalizationFatalError,
    );
    await expect(callParsed(client, params)).rejects.toThrow(LocalizationChunkError);
  });

  it('marks only a 429 as not retryable', async () => {
    const wrapped = withoutRateLimitRetry(async () => rateLimited());
    expect((await wrapped('https://x')).headers.get('x-should-retry')).toBe('false');
    const overloaded = withoutRateLimitRetry(async () => new Response('', { status: 529 }));
    expect((await overloaded('https://x')).headers.get('x-should-retry')).toBeNull();
  });

  it('the SDK sends a 429 once with the flag, and retries it without (no network)', async () => {
    const stub = vi.fn(async () => rateLimited());
    vi.stubGlobal('fetch', stub);
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real');
    const ask = [{ key: '1' }] as unknown as Parameters<ReturnType<typeof createExamplesCaller>>[0];

    const stopping = createExamplesCaller({ model: 'm', maxRetries: 2, stopOnRateLimit: true });
    await expect(stopping(ask)).rejects.toThrow(LocalizationFatalError);
    expect(stub).toHaveBeenCalledTimes(1);

    stub.mockClear();
    const retrying = createExamplesCaller({ model: 'm', maxRetries: 2 });
    await expect(retrying(ask)).rejects.toThrow(LocalizationChunkError);
    expect(stub).toHaveBeenCalledTimes(3);
  });
});

describe('resolveLocalizationModel', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers the flag, then VOCAB_LLM_MODEL, then claude-haiku-5-5', () => {
    vi.stubEnv('VOCAB_LLM_MODEL', '');
    expect(resolveLocalizationModel()).toBe('claude-haiku-5-5');
    vi.stubEnv('VOCAB_LLM_MODEL', 'claude-sonnet-5-5');
    expect(resolveLocalizationModel()).toBe('claude-sonnet-5-5');
    expect(resolveLocalizationModel('claude-opus-5-5')).toBe('claude-opus-5-5');
  });
});
