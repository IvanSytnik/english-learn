/**
 * AI orchestration layer.
 * All Claude/OpenAI calls go through here for:
 *  - centralized prompt templates
 *  - structured output validation
 *  - logging of prompt + response + cost (for evals)
 *
 * Real provider clients will be added in a later phase. This is a stub
 * caller wired to typed prompt schemas.
 */

export * from './prompts/index';
