import { countWholeWord, lexemeKey } from '@englishlearn/db/schemas';
import {
  EXAMPLE_MAX_WORDS,
  EXAMPLE_MIN_WORDS,
  exampleWords,
  normalizeSentence,
} from '@englishlearn/db/vocab/example-checks';
import { GeneratedExampleSchema } from '@englishlearn/db/vocab/examples-snapshot';
import {
  ARTICLELESS_GERMAN_NOUNS,
  glossWordCount,
  MAX_GLOSS_WORDS,
  scriptProblems,
} from '../localization/validator';
import {
  LEXEME_GEN_EXAMPLES,
  LEXEME_GEN_MAX_COLLOCATIONS,
  LEXEME_GEN_MAX_ENTRIES,
  type LexemeGenRejectReason,
  type LexemeGenRequestItem,
  type WireLexemeEntry,
  type WireLexemeGenItem,
  WireLexemeGenResponseSchema,
} from './types';

/**
 * Per-candidate gate of a lexeme generation response (B6.9; B6.10 step 3
 * adds `LexemeSchema` and the blocklist on top). Each requested candidate
 * comes out as exactly one of:
 *   - `entries`: 1..2 entries, every rule below passed;
 *   - `rejected`: the model says it is no word to generate, with its reason;
 *   - `invalid`: the answer breaks a rule — nothing of it is used.
 *
 * Entry rules: lemma Latin lowercase, 1–4 words · sense '' or a 1–3 word
 * lowercase label, unique per pos · definitionEn 1–25 words and not giving
 * the word away · glosses as in B2.4 (script, ≤ 3 words, bare, German noun
 * article) · exactly 3 examples, each a cloze whose target is ONE whole word
 * occurring once (the ladder's `cloze` relies on it, V2-24), 6–18 words,
 * pairwise different, translations in script · ≤ 3 collocations of 2–5 words.
 */

export type ValidLexemeEntry = WireLexemeEntry;

export type LexemeGenOutcome =
  | { key: string; input: string; kind: 'entries'; entries: ValidLexemeEntry[] }
  | {
      key: string;
      input: string;
      kind: 'rejected';
      reason: LexemeGenRejectReason;
      suggestion: string | null;
    }
  | { key: string; input: string; kind: 'invalid'; problems: string[] };

const LEMMA = /^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/;
const SENSE = /^(?:|[a-z]+(?: [a-z]+){0,2})$/;
const GERMAN_ARTICLE = /^(der|die|das) /;
const SINGLE_WORD = /^[\p{L}][\p{L}'-]*$/u;

export function validateLexemeGenBatch(
  requested: readonly LexemeGenRequestItem[],
  data: unknown,
): LexemeGenOutcome[] {
  const wire = WireLexemeGenResponseSchema.safeParse(data);
  const answers = new Map<string, WireLexemeGenItem>();
  const duplicates = new Set<string>();
  for (const item of wire.success ? wire.data.items : []) {
    if (answers.has(item.key)) duplicates.add(item.key);
    answers.set(item.key, item);
  }
  return requested.map(({ key, input }) => {
    const invalid = (...problems: string[]): LexemeGenOutcome => ({
      key,
      input,
      kind: 'invalid',
      problems,
    });
    if (!wire.success) return invalid('response does not match the wire schema');
    if (duplicates.has(key)) return invalid('answered more than once');
    const answer = answers.get(key);
    if (!answer) return invalid('not answered');
    return outcomeOf(key, input, answer);
  });
}

function outcomeOf(key: string, input: string, answer: WireLexemeGenItem): LexemeGenOutcome {
  if (!answer.isWord) {
    const problems: string[] = [];
    if (answer.rejectReason === null) problems.push('isWord false without a rejectReason');
    if (answer.entries.length > 0) problems.push('isWord false with entries');
    if (answer.rejectReason === 'misspelling' && !answer.suggestion?.trim()) {
      problems.push('misspelling without a suggestion');
    }
    if (problems.length > 0 || answer.rejectReason === null) {
      return { key, input, kind: 'invalid', problems };
    }
    return {
      key,
      input,
      kind: 'rejected',
      reason: answer.rejectReason,
      suggestion:
        answer.rejectReason === 'misspelling' ? (answer.suggestion?.trim() ?? null) : null,
    };
  }

  const problems: string[] = [];
  if (answer.rejectReason !== null) problems.push('isWord true with a rejectReason');
  const n = answer.entries.length;
  if (n < 1 || n > LEXEME_GEN_MAX_ENTRIES) {
    problems.push(`expected 1..${LEXEME_GEN_MAX_ENTRIES} entries, got ${n}`);
  }
  const seen = new Set<string>();
  answer.entries.forEach((entry, i) => {
    const id = `${lexemeKey(entry.lemma)}|${entry.pos}|${entry.sense}`;
    if (seen.has(id)) problems.push(`entries.${i}: same lemma, pos and sense as another entry`);
    seen.add(id);
    problems.push(...entryProblems(entry).map((p) => `entries.${i}.${p}`));
  });
  if (n === 2 && answer.entries.some((e) => e.sense === '')) {
    problems.push('two entries need a sense label each');
  }
  if (problems.length > 0) return { key, input, kind: 'invalid', problems: [...new Set(problems)] };
  return { key, input, kind: 'entries', entries: answer.entries };
}

export function entryProblems(entry: WireLexemeEntry): string[] {
  const problems: string[] = [];
  if (!LEMMA.test(entry.lemma)) problems.push(`lemma "${entry.lemma}" is not a lowercase headword`);
  if (!SENSE.test(entry.sense)) problems.push(`sense "${entry.sense}" is not a 1–3 word label`);

  const definitionWords = entry.definitionEn.trim().split(/\s+/u).filter(Boolean).length;
  if (definitionWords < 1 || definitionWords > 25) {
    problems.push(`definitionEn has ${definitionWords} words`);
  }
  if (countWholeWord(entry.definitionEn, entry.lemma) > 0) {
    problems.push('definitionEn gives the word away');
  }

  problems.push(...scriptProblems(entry.translations, 'translations'));
  for (const [locale, gloss] of Object.entries(entry.translations)) {
    if (!gloss.trim()) problems.push(`translations.${locale} is empty`);
    if (glossWordCount(gloss) > MAX_GLOSS_WORDS) {
      problems.push(`translations.${locale} is longer than ${MAX_GLOSS_WORDS} words`);
    }
    if (/[.;:()]/u.test(gloss)) problems.push(`translations.${locale} is not a bare gloss`);
  }
  if (
    entry.pos === 'NOUN' &&
    !ARTICLELESS_GERMAN_NOUNS.has(entry.lemma) &&
    !GERMAN_ARTICLE.test(entry.translations.de)
  ) {
    problems.push('translations.de must start with der/die/das');
  }

  if (entry.examples.length !== LEXEME_GEN_EXAMPLES) {
    problems.push(`expected ${LEXEME_GEN_EXAMPLES} examples, got ${entry.examples.length}`);
  }
  const sentences = new Set<string>();
  entry.examples.forEach((ex, i) => {
    const parsed = GeneratedExampleSchema.safeParse(ex);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`examples.${i}.${issue.path.join('.') || 'item'}: ${issue.message}`);
      }
    }
    if (!SINGLE_WORD.test(ex.clozeTarget.trim())) {
      problems.push(`examples.${i}.clozeTarget "${ex.clozeTarget}" is not one word`);
    }
    const words = exampleWords(ex.sentence).length;
    if (words < EXAMPLE_MIN_WORDS || words > EXAMPLE_MAX_WORDS) {
      problems.push(
        `examples.${i}: ${words} words, not ${EXAMPLE_MIN_WORDS}..${EXAMPLE_MAX_WORDS}`,
      );
    }
    const normalized = normalizeSentence(ex.sentence);
    if (sentences.has(normalized)) problems.push(`examples.${i}: repeats another example`);
    sentences.add(normalized);
    problems.push(...scriptProblems(ex.translation, `examples.${i}.translation`));
  });

  if (entry.collocations.length > LEXEME_GEN_MAX_COLLOCATIONS) {
    problems.push(`more than ${LEXEME_GEN_MAX_COLLOCATIONS} collocations`);
  }
  entry.collocations.forEach((c, i) => {
    const words = c.trim().split(/\s+/u).filter(Boolean).length;
    if (words < 2 || words > 5) problems.push(`collocations.${i} has ${words} words`);
  });
  return problems;
}
