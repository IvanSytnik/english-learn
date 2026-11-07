import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * Closed-class words (B6.2b): ranked after every content word by
 * vocab:sync-frequency (./frequency.ts) and never preselected by the paste
 * import (B6.7a, #33). Dependency-free so the matcher can use it anywhere.
 */

/**
 * Closed-class parts of speech: ranked after every content word. The
 * catalogue tags numbers and determiners `OTHER`. Interjections (`please`,
 * `thanks`, `hello`) are content for a learner — they are not here.
 */
export const CLOSED_CLASS_POS: ReadonlySet<PartOfSpeechValue> = new Set<PartOfSpeechValue>([
  'PREPOSITION',
  'CONJUNCTION',
  'PRONOUN',
  'OTHER',
]);

/**
 * Function adverbs (B6.2b), ranked with the closed classes when tagged
 * ADVERB. Criterion: a grammatical or discourse adverb with no translatable
 * content meaning of its own — negation, degree, focus, deictic time/place
 * pro-forms, wh-adverbs, connectives and the adverbial particles of phrasal
 * verbs. Content adverbs (`always`, `often`, `well`, `really`, `today`,
 * `together`) are not here. A closed list by lemmaKey; the CEFR-J catalogue
 * tags all of these `adverb`.
 */
export const FUNCTION_ADVERBS: ReadonlySet<string> = new Set([
  // negation
  'not',
  'no',
  // degree
  'very',
  'so',
  'too',
  'quite',
  'rather',
  'much',
  'more',
  'most',
  'less',
  'least',
  // focus
  'just',
  'only',
  'even',
  'also',
  'either',
  'else',
  // deictic and aspectual time / place pro-forms
  'now',
  'then',
  'here',
  'there',
  'still',
  'already',
  'yet',
  'ever',
  // wh-adverbs
  'how',
  'when',
  'where',
  'why',
  // connectives
  'however',
  'instead',
  // adverbial particles (phrasal verbs)
  'in',
  'on',
  'up',
  'out',
  'off',
  'down',
  'over',
  'about',
]);

/** Closed class in the rank key: a closed POS, or a function adverb. */
export const isClosedClass = (r: { pos: PartOfSpeechValue; lemmaKey: string }): boolean =>
  CLOSED_CLASS_POS.has(r.pos) || (r.pos === 'ADVERB' && FUNCTION_ADVERBS.has(r.lemmaKey));
