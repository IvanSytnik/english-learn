import { z } from 'zod';

/**
 * Item.content.practice — the question a learner answers for this Item.
 *
 * An Item is the knowledge unit FSRS schedules; `practice` is how it is
 * asked. English only: the prompt and options are the target language, and
 * the "why" comes from the item's own localized explanation/translation.
 * Optional on purpose — selection only serves items that have one.
 *
 * `___` (three underscores) marks the gap the answer fills.
 */
export const PRACTICE_GAP = '___';

const ChoicePracticeSchema = z
  .object({
    type: z.literal('choice'),
    /** English prompt, usually a sentence with one `___` gap. */
    prompt: z.string().trim().min(1),
    /** 2–4 English options, keys 1–4 in the player. */
    options: z.array(z.string().trim().min(1)).min(2).max(4),
    correctIndex: z.number().int().nonnegative(),
  })
  .strict()
  .refine((p) => p.correctIndex < p.options.length, {
    message: 'correctIndex out of range',
    path: ['correctIndex'],
  })
  .refine((p) => new Set(p.options.map((o) => o.toLowerCase())).size === p.options.length, {
    message: 'options must be unique',
    path: ['options'],
  });

const ClozePracticeSchema = z
  .object({
    type: z.literal('cloze'),
    /** English sentence with exactly one `___` gap; a "(base form)" cue may follow. */
    prompt: z.string().trim().min(1),
    /** Accepted fillers, compared after normalizeClozeAnswer. */
    acceptedAnswers: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .refine((p) => p.prompt.split(PRACTICE_GAP).length === 2, {
    message: `cloze prompt needs exactly one ${PRACTICE_GAP}`,
    path: ['prompt'],
  });

export const PracticeSchema = z.discriminatedUnion('type', [
  ChoicePracticeSchema,
  ClozePracticeSchema,
]);
export type Practice = z.infer<typeof PracticeSchema>;

/**
 * Canonical form for comparing a typed cloze answer: trimmed, lower-case,
 * single spaces, typographic apostrophes folded to ASCII.
 */
export function normalizeClozeAnswer(value: string): string {
  return value.replace(/[‘’ʼ]/g, "'").trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isClozeAnswerAccepted(
  practice: Extract<Practice, { type: 'cloze' }>,
  value: string,
): boolean {
  const given = normalizeClozeAnswer(value);
  return (
    given.length > 0 && practice.acceptedAnswers.some((a) => normalizeClozeAnswer(a) === given)
  );
}
