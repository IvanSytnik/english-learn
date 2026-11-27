/**
 * `@englishlearn/ai/lexeme-gen` — the lexeme generation prompt, its wire
 * schema and the per-candidate validator (B6.9). Pure: no client, no DB.
 * B6.10 calls it through the runtime (`runAiCall`); the eval harness
 * (`evals/lexeme-gen`) runs it against the golden set.
 */

export {
  buildLexemeGenRequest,
  buildLexemeGenUserPrompt,
  LEXEME_GEN_MAX_TOKENS_PER_ITEM,
  LEXEME_GEN_PROMPT_VERSION,
  LEXEME_GEN_SYSTEM_PROMPT,
  type LexemeGenRequestOptions,
} from './prompt';
export {
  LEXEME_GEN_BATCH_MAX,
  LEXEME_GEN_EXAMPLES,
  LEXEME_GEN_MAX_COLLOCATIONS,
  LEXEME_GEN_MAX_ENTRIES,
  LEXEME_GEN_REJECT_REASONS,
  type LexemeGenRejectReason,
  LexemeGenRejectReasonSchema,
  type LexemeGenRequestItem,
  type WireLexemeEntry,
  WireLexemeEntrySchema,
  type WireLexemeGenItem,
  WireLexemeGenItemSchema,
  type WireLexemeGenResponse,
  WireLexemeGenResponseSchema,
} from './types';
export {
  entryProblems,
  type LexemeGenOutcome,
  type ValidLexemeEntry,
  validateLexemeGenBatch,
} from './validator';
