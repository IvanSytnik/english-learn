import type { z } from 'zod';
import type { RuntimeModel, TokenUsage } from './prices';

/**
 * The provider seam of the AI runtime (B6.9). Anthropic is the only
 * implementation; a second paid provider may be added behind this interface
 * only after the eval harness passes for its model (V2-7). Free tiers are
 * never used for runtime.
 */

export type AiEffort = 'low' | 'medium' | 'high';

/** One structured-output request: a frozen system prompt, one user message. */
export type AiRequest<T> = {
  model: RuntimeModel;
  /** Stable across calls of a feature — it is the prompt-cache prefix. */
  system: string;
  user: string;
  /** Validates the parsed output; also given to the provider as the format. */
  schema: z.ZodType<T>;
  maxTokens: number;
  effort?: AiEffort;
  /** The caller's cancellation (e.g. the request ended). */
  signal?: AbortSignal;
};

/**
 * Why a call produced no data. The first three are decided by the runtime
 * before the provider is called (no AiUsage row); the rest come back from a
 * call that was made (an AiUsage row with ok = false).
 */
export const AI_ERROR_CODES = [
  'disabled',
  'budget_exceeded',
  'user_cap',
  'timeout',
  'aborted',
  'rate_limited',
  'provider_error',
  'refused',
  'truncated',
  'invalid_output',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
export type PreflightErrorCode = Extract<AiErrorCode, 'disabled' | 'budget_exceeded' | 'user_cap'>;
export type CallErrorCode = Exclude<AiErrorCode, PreflightErrorCode>;

/**
 * What the provider reports for one call. `usage` is `null` when no response
 * arrived (timeout, abort, network or HTTP error): the tokens are unknown, so
 * the runtime books the call's worst case.
 */
export type ProviderResult<T> =
  | { ok: true; data: T; usage: TokenUsage; latencyMs: number }
  | {
      ok: false;
      code: CallErrorCode;
      message: string;
      usage: TokenUsage | null;
      latencyMs: number;
    };

export interface AiProvider {
  call<T>(request: AiRequest<T>): Promise<ProviderResult<T>>;
}
