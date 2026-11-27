import 'server-only';

/**
 * `@englishlearn/ai/runtime` — the request-path AI runtime (B6.9). Server
 * only: it holds the runtime API key and writes AiUsage. Offline scripts and
 * the eval harness import the modules directly.
 */

export {
  createAnthropicProvider,
  MissingRuntimeKeyError,
  RUNTIME_API_KEY_ENV,
  RUNTIME_MAX_RETRIES,
  RUNTIME_TIMEOUT_MS,
} from './anthropic-provider';
export {
  costMicroUsd,
  isRuntimeModel,
  MODEL_PRICES,
  type RuntimeModel,
  type TokenUsage,
} from './prices';
export {
  AI_ERROR_CODES,
  type AiEffort,
  type AiErrorCode,
  type AiProvider,
  type AiRequest,
  type ProviderResult,
} from './provider';
export {
  type AiCall,
  type AiResult,
  type AiRuntimeDb,
  type AiRuntimeDeps,
  type FlagReader,
  runAiCall,
  startOfUtcDay,
} from './run';
