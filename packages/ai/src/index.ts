/**
 * AI orchestration layer.
 * All Claude/OpenAI calls go through here for:
 *  - centralized prompt templates
 *  - structured output validation
 *  - logging of prompt + response + cost (for evals)
 *
 * Real provider clients and their prompt schemas will be added in a later
 * phase (MVP-2). Nothing is exported yet.
 */

export {};
