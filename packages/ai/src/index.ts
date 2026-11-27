/**
 * AI orchestration layer: every LLM call goes through this package
 * (centralized prompts, structured-output validation, cost accounting).
 *
 * The root entry exports nothing. Entry points:
 *   - `@englishlearn/ai/localization`, `@englishlearn/ai/examples` — offline
 *     content pipelines (B2.4, B6.4a), run as scripts with the scripts key;
 *   - `@englishlearn/ai/runtime` — the request-path runtime (B6.9, server
 *     only): provider interface + Anthropic provider with the runtime key,
 *     `runAiCall` (kill switch, global and per-user daily budgets, AiUsage);
 *   - `@englishlearn/ai/lexeme-gen` — the lexeme generation prompt, schema
 *     and validator (B6.9; B6.10 wires it). Its eval: `evals/lexeme-gen`.
 * The web app does not depend on this package until B6.10.
 */

export {};
