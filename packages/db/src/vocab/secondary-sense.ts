import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * "Effectively secondary" (B6-SPEC §2 secondarySense, V2-10, V2-19a): the one
 * place SECONDARY_SENSE_OVERRIDES apply. The rank (./frequency.ts,
 * `secondarySenseIds`) and the paste import's preselection
 * (@englishlearn/learner-model, vocab/import/match.ts) both call
 * `isEffectivelySecondary`; neither keeps its own exception list. Pure, no
 * I/O and no import of ./dataset.ts (node:fs): the paste matcher runs in the
 * web server bundle.
 */

/**
 * Entries the secondary-sense rule gets wrong, made primary by name (V2-10,
 * Ivan's review of the 58 shadowed entries, 2026-11-05): data with a reason
 * each, never a heuristic. Applied after the rule — an entry listed here is
 * primary whatever the shadowed flag or a lower level of its key says.
 */
export const SECONDARY_SENSE_OVERRIDES: readonly {
  readonly lemmaKey: string;
  readonly pos: PartOfSpeechValue;
  readonly sense: string;
  readonly reason: string;
}[] = Object.freeze([
  {
    lemmaKey: 'need',
    pos: 'VERB',
    sense: '',
    reason:
      'Shadowed by the modal `need` (`need not`), which is rare in modern English; the main verb (`I need help`) carries the form.',
  },
  {
    lemmaKey: 'little',
    pos: 'ADJECTIVE',
    sense: '',
    reason:
      'Shadowed by the determiner (`a little milk`), but the adjective (`a little house`) is a core A1 sense of the form, not a second one.',
  },
]);

/**
 * Whether a lexeme is a secondary sense once the overrides are applied: the
 * rule marks it — `shadowed` (the dataset flag `shadowedByExcludedPos`) or,
 * for the rank only, `lowerLevel` (another PUBLISHED entry of its lemmaKey
 * has a strictly lower CEFR level) — and it is not in
 * SECONDARY_SENSE_OVERRIDES (`need` verb, `little` adjective).
 */
export function isEffectivelySecondary(
  lexeme: { lemmaKey: string; pos: string; sense: string },
  rule: { shadowed: boolean; lowerLevel?: boolean },
): boolean {
  const overridden = SECONDARY_SENSE_OVERRIDES.some(
    (o) => o.lemmaKey === lexeme.lemmaKey && o.pos === lexeme.pos && o.sense === lexeme.sense,
  );
  return (rule.shadowed || rule.lowerLevel === true) && !overridden;
}
