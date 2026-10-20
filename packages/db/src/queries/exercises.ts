import 'server-only';

import { prisma } from '../client';
import {
  type DiagnosticContent,
  DiagnosticContentSchema,
  type GrammarContent,
  GrammarContentSchema,
  getConceptTitle,
  type ItemContent,
  type ItemKindValue,
  type ListeningContent,
  ListeningContentSchema,
  type Locale,
  localized,
  type Practice,
  parseItemContent,
  type VocabContent,
  VocabContentSchema,
} from '../schemas';

/**
 * Convenience filter for student-facing queries: only PUBLISHED items.
 *
 * Admin/tutor surfaces should query without this filter.
 */
const PUBLISHED = { status: 'PUBLISHED' as const };

// ─── Vocab ──────────────────────────────────────────────────────────────────

/** Locale-resolved vocab view for the student UI. */
export type VocabExerciseView = {
  id: string;
  cefrLevel: string;
  targetLexeme: string;
  exampleSentence: string | null;
  instructions: string;
  prompt: string;
  explanation: string | null;
  exampleTranslation: string | null;
  choices: string[];
  correctIndex: number;
};

export async function getVocabExerciseForStudent(
  id: string,
  locale: Locale,
): Promise<VocabExerciseView | null> {
  const row = await prisma.vocabExercise.findFirst({
    where: { id, ...PUBLISHED },
    select: { id: true, cefrLevel: true, content: true },
  });
  if (!row) return null;

  const content: VocabContent = VocabContentSchema.parse(row.content);
  return {
    id: row.id,
    cefrLevel: row.cefrLevel,
    targetLexeme: content.source.targetLexeme,
    exampleSentence: content.source.exampleSentence ?? null,
    instructions: localized(content.localized.instructions, locale),
    prompt: localized(content.localized.prompt, locale),
    explanation: content.localized.explanation
      ? localized(content.localized.explanation, locale)
      : null,
    exampleTranslation: content.localized.exampleTranslation
      ? localized(content.localized.exampleTranslation, locale)
      : null,
    choices: content.choices,
    correctIndex: content.correctIndex,
  };
}

// ─── Grammar ────────────────────────────────────────────────────────────────

export type GrammarExerciseView = {
  id: string;
  cefrLevel: string;
  template: string;
  acceptedAnswers: string[];
  instructions: string;
  hint: string | null;
  explanation: string | null;
};

export async function getGrammarExerciseForStudent(
  id: string,
  locale: Locale,
): Promise<GrammarExerciseView | null> {
  const row = await prisma.grammarExercise.findFirst({
    where: { id, ...PUBLISHED },
    select: { id: true, cefrLevel: true, content: true },
  });
  if (!row) return null;

  const content: GrammarContent = GrammarContentSchema.parse(row.content);
  return {
    id: row.id,
    cefrLevel: row.cefrLevel,
    template: content.source.template,
    acceptedAnswers: content.source.acceptedAnswers,
    instructions: localized(content.localized.instructions, locale),
    hint: content.localized.hint ? localized(content.localized.hint, locale) : null,
    explanation: content.localized.explanation
      ? localized(content.localized.explanation, locale)
      : null,
  };
}

// ─── Listening ──────────────────────────────────────────────────────────────

export type ListeningQuestionView = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
};

export type ListeningExerciseView = {
  id: string;
  cefrLevel: string;
  audioUrl: string;
  durationSec: number;
  transcript: string;
  instructions: string;
  contextNote: string | null;
  questions: ListeningQuestionView[];
};

export async function getListeningExerciseForStudent(
  id: string,
  locale: Locale,
): Promise<ListeningExerciseView | null> {
  const row = await prisma.listeningExercise.findFirst({
    where: { id, ...PUBLISHED },
    select: { id: true, cefrLevel: true, content: true },
  });
  if (!row) return null;

  const content: ListeningContent = ListeningContentSchema.parse(row.content);
  return {
    id: row.id,
    cefrLevel: row.cefrLevel,
    audioUrl: content.source.audioUrl,
    durationSec: content.source.durationSec,
    transcript: content.source.transcript,
    instructions: localized(content.localized.instructions, locale),
    contextNote: content.localized.contextNote
      ? localized(content.localized.contextNote, locale)
      : null,
    questions: content.questions.map((q) => ({
      id: q.id,
      prompt: localized(q.prompt, locale),
      choices: q.choices.map((c) => localized(c, locale)),
      correctIndex: q.correctIndex,
      explanation: q.explanation ? localized(q.explanation, locale) : null,
    })),
  };
}

// ─── Diagnostic ─────────────────────────────────────────────────────────────

/**
 * What the learner sees of a diagnostic item: the question only. The answer
 * key (correctIndex) and the explanation never leave the server — grade with
 * checkDiagnosticAnswer instead.
 */
export type DiagnosticItemView = {
  id: string;
  cefrLevel: string;
  kind: 'VOCAB' | 'GRAMMAR' | 'LISTENING';
  stem: string;
  choices: string[];
};

export async function getDiagnosticItemForStudent(id: string): Promise<DiagnosticItemView | null> {
  const row = await prisma.diagnosticItem.findFirst({
    where: { id, ...PUBLISHED },
    select: { id: true, cefrLevel: true, kind: true, content: true },
  });
  if (!row) return null;

  const content: DiagnosticContent = DiagnosticContentSchema.parse(row.content);
  return {
    id: row.id,
    cefrLevel: row.cefrLevel,
    kind: row.kind,
    stem: content.source.stem,
    choices: content.source.choices,
  };
}

/**
 * Grades a submitted choice. Anything that is not an in-range integer index
 * (a string, a float, NaN, null, out of range) is incorrect, never correct.
 */
export function gradeDiagnosticChoice(content: DiagnosticContent, choiceIndex: unknown): boolean {
  return (
    typeof choiceIndex === 'number' &&
    Number.isInteger(choiceIndex) &&
    choiceIndex >= 0 &&
    choiceIndex < content.source.choices.length &&
    choiceIndex === content.source.correctIndex
  );
}

/**
 * Server-side check of a diagnostic answer; the key is read here and only the
 * verdict is returned. Null for an unknown or unpublished item, so callers can
 * tell "no such question" from "wrong answer".
 */
export async function checkDiagnosticAnswer(
  itemId: string,
  choiceIndex: unknown,
): Promise<{ correct: boolean } | null> {
  const row = await prisma.diagnosticItem.findFirst({
    where: { id: itemId, ...PUBLISHED },
    select: { content: true },
  });
  if (!row) return null;

  const content: DiagnosticContent = DiagnosticContentSchema.parse(row.content);
  return { correct: gradeDiagnosticChoice(content, choiceIndex) };
}

// ─── Practice items (adaptive player) ───────────────────────────────────────

/**
 * A PUBLISHED Item with its practice question, for the adaptive player.
 * Returns the parsed content (including the answer key) — callers must keep
 * it on the server and send the learner only the question.
 */
export type PracticeItemRecord = {
  id: string;
  kind: ItemKindValue;
  content: ItemContent;
  practice: Practice;
  concept: { id: string; name: string; title: unknown; cefrLevel: string };
};

export async function getPublishedPracticeItem(itemId: string): Promise<PracticeItemRecord | null> {
  const row = await prisma.item.findFirst({
    where: { id: itemId, ...PUBLISHED },
    select: {
      id: true,
      kind: true,
      content: true,
      concept: { select: { id: true, name: true, title: true, cefrLevel: true } },
    },
  });
  if (!row) return null;
  const content = parseItemContent(row.kind, row.content);
  if (!content.practice) return null;
  return {
    id: row.id,
    kind: row.kind,
    content,
    practice: content.practice,
    concept: row.concept,
  };
}

/** Learner-facing titles for concept ids (title[locale] → title.en → name). */
export async function getConceptTitles(
  ids: readonly string[],
  locale: Locale,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.concept.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, title: true },
  });
  return new Map(rows.map((r) => [r.id, getConceptTitle(r, locale)]));
}
