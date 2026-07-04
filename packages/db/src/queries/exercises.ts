import "server-only";

import { prisma } from "../client";
import {
  type DiagnosticContent,
  DiagnosticContentSchema,
  type GrammarContent,
  GrammarContentSchema,
  type ListeningContent,
  ListeningContentSchema,
  type Locale,
  type VocabContent,
  VocabContentSchema,
  localized,
} from "../schemas";

/**
 * Convenience filter for student-facing queries: only PUBLISHED items.
 *
 * Admin/tutor surfaces should query without this filter.
 */
const PUBLISHED = { status: "PUBLISHED" as const };

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

export type DiagnosticItemView = {
  id: string;
  cefrLevel: string;
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
};

export async function getDiagnosticItemForStudent(
  id: string,
  locale: Locale,
): Promise<DiagnosticItemView | null> {
  const row = await prisma.diagnosticItem.findFirst({
    where: { id, ...PUBLISHED },
    select: { id: true, cefrLevel: true, content: true },
  });
  if (!row) return null;

  const content: DiagnosticContent = DiagnosticContentSchema.parse(row.content);
  return {
    id: row.id,
    cefrLevel: row.cefrLevel,
    stem: content.source.stem,
    choices: content.source.choices,
    correctIndex: content.source.correctIndex,
    explanation: content.localized?.explanation
      ? localized(content.localized.explanation, locale)
      : null,
  };
}
