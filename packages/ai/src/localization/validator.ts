import { countWholeWord } from '@englishlearn/db/schemas';
import {
  type BatchLocalizationItem,
  BatchLocalizationItemSchema,
  type FullTranslations,
  type PendingLexeme,
  WireLocalizationResponseSchema,
} from './types';

/**
 * Per-item acceptance of a model response: every requested lexeme is either
 * accepted (ready to write as REVIEW) or rejected with its reasons — one bad
 * item never discards the rest of the batch.
 */

export type RejectedItem = { id: string; lemma: string; reasons: string[] };
export type ValidatedBatch = { accepted: BatchLocalizationItem[]; rejected: RejectedItem[] };

export const MAX_GLOSS_WORDS = 3;

const GERMAN_ARTICLE = /^(der|die|das) /;

/**
 * CEFR-J nouns whose German gloss takes no article: forms of address
 * (`Herr`, `Frau`) and nouns that live only in a fixed phrase
 * (`plenty` → `genug`, `for the sake of` → `um … willen`,
 * `on behalf of` → `im Namen von`). Found by the full B2.4 run: the model
 * refused the article twice, rightly. An explicit list, not a looser rule.
 */
export const ARTICLELESS_GERMAN_NOUNS: ReadonlySet<string> = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'miss',
  'sir',
  'plenty',
  'sake',
  'behalf',
]);
const RU_ONLY = /[ыэъёЫЭЪЁ]/u;
const UK_ONLY = /[іїєґІЇЄҐ]/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Words in a gloss, not counting the `/` of an aspect pair
 * (`делать / сделать` = 2) or a German article (`der Apfel` = 1).
 */
export function glossWordCount(gloss: string): number {
  const words = gloss.replace(GERMAN_ARTICLE, '').split(/[\s/,]+/u);
  return words.filter(Boolean).length;
}

/** Script check: a Russian text has no Ukrainian-only letter and vice versa; German has no Cyrillic. */
function scriptProblems(text: FullTranslations, where: string): string[] {
  const problems: string[] = [];
  if (!CYRILLIC.test(text.ru) || UK_ONLY.test(text.ru)) problems.push(`${where}.ru is not Russian`);
  if (!CYRILLIC.test(text.uk) || RU_ONLY.test(text.uk))
    problems.push(`${where}.uk is not Ukrainian`);
  if (CYRILLIC.test(text.de)) problems.push(`${where}.de is not German`);
  return problems;
}

function glossProblems(item: BatchLocalizationItem): string[] {
  const problems = scriptProblems(item.translations, 'translations');
  for (const [locale, gloss] of Object.entries(item.translations)) {
    if (glossWordCount(gloss) > MAX_GLOSS_WORDS) {
      problems.push(`translations.${locale} is longer than ${MAX_GLOSS_WORDS} words`);
    }
    if (/[.;:()]/u.test(gloss)) problems.push(`translations.${locale} is not a bare gloss`);
  }
  if (
    item.pos === 'NOUN' &&
    !ARTICLELESS_GERMAN_NOUNS.has(item.lemma.toLowerCase()) &&
    !GERMAN_ARTICLE.test(item.translations.de)
  ) {
    problems.push('translations.de must start with der/die/das');
  }
  if (countWholeWord(item.definitions.en, item.lemma) > 0) {
    problems.push('definitions.en gives the word away');
  }
  item.examples.forEach((ex, i) => {
    problems.push(...scriptProblems(ex.translation, `examples.${i}.translation`));
  });
  return problems;
}

export function validateLocalizedBatch(
  requested: readonly PendingLexeme[],
  data: unknown,
): ValidatedBatch {
  const wire = WireLocalizationResponseSchema.safeParse(data);
  const answers = new Map<string, unknown>();
  const duplicates = new Set<string>();
  for (const item of wire.success ? wire.data.items : []) {
    if (answers.has(item.key)) duplicates.add(item.key);
    answers.set(item.key, item);
  }

  const accepted: BatchLocalizationItem[] = [];
  const rejected: RejectedItem[] = [];
  for (const lexeme of requested) {
    const reject = (...reasons: string[]) =>
      rejected.push({ id: lexeme.id, lemma: lexeme.lemma, reasons });

    if (!wire.success) {
      reject('response does not match the wire schema');
      continue;
    }
    if (duplicates.has(lexeme.key)) {
      reject('answered more than once');
      continue;
    }
    const answer = answers.get(lexeme.key) as (typeof wire.data.items)[number] | undefined;
    if (!answer) {
      reject('not answered');
      continue;
    }
    if (answer.lemma.trim().toLowerCase() !== lexeme.lemma.toLowerCase()) {
      reject(`answered for "${answer.lemma}"`);
      continue;
    }

    const parsed = BatchLocalizationItemSchema.safeParse({
      id: lexeme.id,
      lemma: lexeme.lemma,
      pos: lexeme.pos,
      sense: lexeme.sense,
      definitions: { en: answer.definitionEn },
      translations: answer.translations,
      examples: answer.examples,
      collocations: answer.collocations,
    });
    if (!parsed.success) {
      reject(...parsed.error.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`));
      continue;
    }
    const problems = glossProblems(parsed.data);
    if (problems.length > 0) reject(...problems);
    else accepted.push(parsed.data);
  }
  return { accepted, rejected };
}
