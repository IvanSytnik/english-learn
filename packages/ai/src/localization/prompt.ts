import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { type LocalizationRequestItem, WireLocalizationResponseSchema } from './types';

/**
 * The localization prompt. The system prompt is a frozen constant — no
 * timestamps, no per-run values — so it is a stable cache prefix; everything
 * that varies goes into the user message.
 */

export const LOCALIZATION_SYSTEM_PROMPT = `You write dictionary entries for an English course for learners whose native language is Russian, Ukrainian or German.

For each English word you receive, return one item with the same "key" and "lemma", in this shape:
- definitionEn: one short English definition of the word in the given part of speech and sense, written for a learner at the given CEFR level. Do not use the word itself or a form of it in the definition.
- translations: { ru, uk, de } — dictionary glosses, not explanations: at most 3 words each, no punctuation except "/" or ",". Verbs in Russian and Ukrainian are infinitives; where aspect matters, give the pair as "imperfective / perfective" (e.g. "делать / сделать"). German nouns always start with the article: "der", "die" or "das" (e.g. "der Apfel"). Ukrainian must be Ukrainian, never Russian.
- examples: 1 or 2 natural sentences at the given CEFR level that show this sense. "clozeTarget" is the exact form of the word as it appears in the sentence (e.g. "ran" for "run"); it must appear in the sentence exactly once, as a whole word. "translation" gives the whole sentence in ru, uk and de.
- collocations: up to 3 common English collocations with the word, or an empty list.

The "sense" field, when present, says which meaning is meant; otherwise use the most common meaning for that part of speech at that level. The "topic" field is a hint for the meaning. Answer every item; never skip, merge or add items.`;

export type LocalizationRequestOptions = {
  model: string;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
};

/** One line per lexeme; keys are the short local ids the response must echo. */
export function buildUserPrompt(items: readonly LocalizationRequestItem[]): string {
  const lines = items.map((item) =>
    JSON.stringify({
      key: item.key,
      lemma: item.lemma,
      pos: item.pos,
      sense: item.sense || undefined,
      level: item.cefrLevel,
      topic: item.topic,
    }),
  );
  return `Words:\n${lines.join('\n')}`;
}

export const LOCALIZATION_OUTPUT_FORMAT = zodOutputFormat(WireLocalizationResponseSchema);

export function buildLocalizationRequest(
  items: readonly LocalizationRequestItem[],
  options: LocalizationRequestOptions,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? 16_000,
    system: [
      { type: 'text', text: LOCALIZATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildUserPrompt(items) }],
    output_config: {
      format: LOCALIZATION_OUTPUT_FORMAT,
      ...(options.effort ? { effort: options.effort } : {}),
    },
  };
}
