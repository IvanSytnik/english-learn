import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EXAMPLE_MAX_WORDS, EXAMPLE_MIN_WORDS } from '@englishlearn/db/vocab/example-checks';
import type { LocalizationRequestOptions } from '../localization/prompt';
import { type ExamplesRequestItem, WireExamplesResponseSchema } from './types';

/**
 * The examples prompt (B6.4a). Frozen system prompt — a stable cache prefix,
 * no per-run values; the words go into the user message. Bump
 * EXAMPLES_PROMPT_VERSION with any change of the text: the snapshot records
 * it.
 */

export const EXAMPLES_PROMPT_VERSION = 'v1';

export const EXAMPLES_SYSTEM_PROMPT = `You write example sentences for an English course for learners whose native language is Russian, Ukrainian or German.

For each English word you receive, return one item with the same "key" and "lemma" and exactly 2 NEW example sentences in "examples". Each example:
- sentence: one natural, self-contained English sentence of ${EXAMPLE_MIN_WORDS} to ${EXAMPLE_MAX_WORDS} words that shows the word in exactly the given part of speech ("pos") and meaning ("meaning", "sense") — never another meaning or part of speech of the same spelling. Use vocabulary and grammar a learner at the given CEFR "level" knows; avoid rarer words than necessary. No names of real people, brands or politics.
- clozeTarget: the exact form of the word as it appears in the sentence (e.g. "ran" for "run", "children" for "child"). It must appear in the sentence exactly once, as a whole word, and nowhere else in another form.
- translation: the whole sentence translated naturally into ru (Russian), uk (Ukrainian — never Russian) and de (German).

The two new sentences must differ from each other and from every sentence in "existing" — a different situation, not a reworded copy. When the word changes its form (plural, past tense, -ing, third person, comparative), at least one of the two uses a form other than "existingForm" or puts the word in another place in the sentence (beginning, middle, end) than in the first existing sentence. Answer every item; never skip, merge or add items.`;

export function buildExamplesUserPrompt(items: readonly ExamplesRequestItem[]): string {
  const lines = items.map((item) =>
    JSON.stringify({
      key: item.key,
      lemma: item.lemma,
      pos: item.pos,
      sense: item.sense || undefined,
      meaning: item.meaning,
      level: item.cefrLevel,
      topic: item.topic,
      existing: item.existing,
      existingForm: item.existingForm,
    }),
  );
  return `Words:\n${lines.join('\n')}`;
}

export const EXAMPLES_OUTPUT_FORMAT = zodOutputFormat(WireExamplesResponseSchema);

export function buildExamplesRequest(
  items: readonly ExamplesRequestItem[],
  options: LocalizationRequestOptions,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? 16_000,
    system: [{ type: 'text', text: EXAMPLES_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildExamplesUserPrompt(items) }],
    output_config: {
      format: EXAMPLES_OUTPUT_FORMAT,
      ...(options.effort ? { effort: options.effort } : {}),
    },
  };
}
