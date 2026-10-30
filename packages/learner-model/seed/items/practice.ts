/**
 * Builders for seed practice questions (Item.content.practice). Grammar
 * questions sit next to their item in seed/items/grammar/*; vocabulary
 * questions are in seed/items/vocab-practice.ts.
 *
 * Authoring rules:
 *   - one question tests exactly the item's pattern, nothing else;
 *   - every distractor must be WRONG in the given sentence, not merely less
 *     natural — no "also acceptable" options (e.g. never offer "will meet"
 *     next to "are meeting");
 *   - the correct option moves around (no "always the first one" tell);
 *   - cloze prompts carry a "(base form)" cue so the answer is unambiguous.
 *
 * Every seed item must have a question — enforced by
 * src/__tests__/seed-practice.test.ts.
 */

import type { Practice } from '@englishlearn/db/schemas';

export const choice = (prompt: string, options: string[], correctIndex: number): Practice => ({
  type: 'choice',
  prompt,
  options,
  correctIndex,
});

export const cloze = (prompt: string, ...acceptedAnswers: string[]): Practice => ({
  type: 'cloze',
  prompt,
  acceptedAnswers,
});
