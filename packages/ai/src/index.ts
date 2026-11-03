/**
 * AI orchestration layer: every Claude/OpenAI call goes through this package
 * (centralized prompts, structured-output validation, token usage reporting).
 *
 * The root entry exports nothing. What exists today is offline only:
 *   - `@englishlearn/ai/localization` — the B2.4 vocabulary localization
 *     pipeline (Anthropic SDK, structured output, validation gate), run by
 *     `pnpm --filter @englishlearn/ai vocab:localize`.
 * No runtime (request-path) LLM call exists yet; the web app does not depend
 * on this package until one does (C3).
 */

export {};
