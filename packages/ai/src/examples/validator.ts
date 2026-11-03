import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import {
  EXAMPLE_MAX_WORDS,
  EXAMPLE_MIN_WORDS,
  exampleWords,
  INFLECTING_POS,
  normalizeSentence,
  targetPosition,
} from '@englishlearn/db/vocab/example-checks';
import {
  type ExamplesSnapshotEntry,
  GeneratedExampleSchema,
} from '@englishlearn/db/vocab/examples-snapshot';
import { scriptProblems } from '../localization/validator';
import { type PendingExamples, WireExamplesResponseSchema } from './types';

/**
 * Per-item gate of the examples job (B6.4a). An item is accepted with both
 * of its sentences or rejected with its reasons — the word then keeps the
 * examples it has. Rules, in order:
 *   - exactly 2 examples, each a LexemeExampleSchema cloze (the target once,
 *     as a whole word — pitfall 177) with ru / uk / de translations;
 *   - EXAMPLE_MIN_WORDS..EXAMPLE_MAX_WORDS words;
 *   - normalized, different from every existing example and from each other;
 *   - for a word that inflects (INFLECTING_POS), at least one of the two
 *     uses another surface form than examples[0], or another position
 *     (start / middle / end) of the target in the sentence;
 *   - the translation script checks of B2.4 (ru not Ukrainian, uk not
 *     Russian, de not Cyrillic).
 */

export type RejectedExamples = {
  lemmaKey: string;
  pos: string;
  sense: string;
  lemma: string;
  reasons: string[];
};
export type ValidatedExamples = {
  accepted: ExamplesSnapshotEntry[];
  rejected: RejectedExamples[];
};

export function validateExamplesBatch(
  requested: readonly PendingExamples[],
  data: unknown,
): ValidatedExamples {
  const wire = WireExamplesResponseSchema.safeParse(data);
  const answers = new Map<string, (typeof WireExamplesResponseSchema._output)['items'][number]>();
  const duplicates = new Set<string>();
  for (const item of wire.success ? wire.data.items : []) {
    if (answers.has(item.key)) duplicates.add(item.key);
    answers.set(item.key, item);
  }

  const accepted: ExamplesSnapshotEntry[] = [];
  const rejected: RejectedExamples[] = [];
  for (const lexeme of requested) {
    const reject = (...reasons: string[]) =>
      rejected.push({
        lemmaKey: lexeme.lemmaKey,
        pos: lexeme.pos,
        sense: lexeme.sense,
        lemma: lexeme.lemma,
        reasons,
      });
    if (!wire.success) {
      reject('response does not match the wire schema');
      continue;
    }
    if (duplicates.has(lexeme.key)) {
      reject('answered more than once');
      continue;
    }
    const answer = answers.get(lexeme.key);
    if (!answer) {
      reject('not answered');
      continue;
    }
    if (answer.lemma.trim().toLowerCase() !== lexeme.lemma.toLowerCase()) {
      reject(`answered for "${answer.lemma}"`);
      continue;
    }
    // An intersection schema can report one issue twice.
    const problems = [...new Set(examplesProblems(lexeme, answer.examples))];
    if (problems.length > 0) {
      reject(...problems);
      continue;
    }
    accepted.push({
      lemmaKey: lexeme.lemmaKey,
      pos: lexeme.pos,
      sense: lexeme.sense,
      base: lexeme.base,
      examples: answer.examples.map((ex) => GeneratedExampleSchema.parse(ex)),
    });
  }
  return { accepted, rejected };
}

function examplesProblems(lexeme: PendingExamples, examples: readonly unknown[]): string[] {
  if (examples.length !== 2) return [`expected 2 examples, got ${examples.length}`];
  const problems: string[] = [];
  const parsed = examples.map((ex, i) => {
    const r = GeneratedExampleSchema.safeParse(ex);
    if (!r.success) {
      problems.push(
        ...r.error.issues.map(
          (issue) => `examples.${i}.${issue.path.join('.') || 'item'}: ${issue.message}`,
        ),
      );
      return null;
    }
    return r.data;
  });
  if (problems.length > 0) return problems;
  const [a, b] = parsed as [NonNullable<(typeof parsed)[0]>, NonNullable<(typeof parsed)[0]>];

  const existing = new Set(lexeme.existing.map(normalizeSentence));
  [a, b].forEach((ex, i) => {
    const words = exampleWords(ex.sentence).length;
    if (words < EXAMPLE_MIN_WORDS || words > EXAMPLE_MAX_WORDS) {
      problems.push(
        `examples.${i}: ${words} words, not ${EXAMPLE_MIN_WORDS}..${EXAMPLE_MAX_WORDS}`,
      );
    }
    if (existing.has(normalizeSentence(ex.sentence))) {
      problems.push(`examples.${i}: repeats an existing example`);
    }
    problems.push(...scriptProblems(ex.translation, `examples.${i}.translation`));
  });
  if (normalizeSentence(a.sentence) === normalizeSentence(b.sentence)) {
    problems.push('the two examples are the same sentence');
  }

  if (INFLECTING_POS.has(lexeme.pos as PartOfSpeechValue)) {
    const baseForm = lexeme.existingForm.toLowerCase();
    const basePlace = targetPosition(lexeme.base, lexeme.existingForm);
    const varied = [a, b].some(
      (ex) =>
        ex.clozeTarget.toLowerCase() !== baseForm ||
        targetPosition(ex.sentence, ex.clozeTarget) !== basePlace,
    );
    if (!varied) {
      problems.push(
        `neither example varies the form "${lexeme.existingForm}" or its place (${basePlace}) of examples[0]`,
      );
    }
  }
  return problems;
}
