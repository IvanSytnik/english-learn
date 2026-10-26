import {
  type ItemContent,
  type ItemKindValue,
  isClozeAnswerAccepted,
  isNativeLanguage,
  type Locale,
  type LocalizedString,
  localized,
  PRACTICE_GAP,
  type Practice,
} from '@englishlearn/db/schemas';
import type { MasteryStage } from '@englishlearn/learner-model';
import type { SelectionReasonValue, StageValue } from '@englishlearn/ui';

/**
 * Pure view-model layer for the adaptive exercise player.
 *
 * Everything that crosses to the client is built here, and the answer key
 * never does: `ExerciseView.question` has no correctIndex / acceptedAnswers.
 * Grading happens on the server (gradeAnswer) inside submitExerciseAttempt.
 */

/**
 * Session length picker: minutes → fixed number of items (HANDOFF §7, Case D).
 * Roughly 50 s per item including feedback — an estimate until real
 * occurredAt gaps can calibrate it.
 */
export const SESSION_ITEMS = { 5: 6, 10: 12, 20: 24 } as const;

export type SessionMinutes = keyof typeof SESSION_ITEMS;

export const SESSION_MINUTES: readonly SessionMinutes[] = [5, 10, 20];

export const DEFAULT_SESSION_MINUTES: SessionMinutes = 10;

/**
 * `?minutes=` → an allowlisted length, or null (show the picker). Only the
 * exact strings "5" | "10" | "20" pass; a repeated param arrives as an array
 * and is rejected, not narrowed to its first element.
 *
 * Length is client-enforced by design (§8 #9); allowlist guards the input,
 * not the session.
 */
export function parseSessionMinutes(raw: unknown): SessionMinutes | null {
  if (typeof raw !== 'string') return null;
  return SESSION_MINUTES.find((m) => String(m) === raw) ?? null;
}

/** How many recently shown items the player asks selectNext to skip. */
export const RECENT_EXCLUDE = 3;

const DAY_MS = 86_400_000;

export type ExerciseQuestion =
  | { type: 'choice'; prompt: string; options: string[] }
  | { type: 'cloze'; prompt: string };

export type ReasonDetail =
  | { kind: 'lastPractised'; days: number }
  | { kind: 'unlockedBy'; concepts: string[] }
  | null;

export type ExerciseView = {
  itemId: string;
  conceptTitle: string;
  reason: SelectionReasonValue;
  isNewConcept: boolean;
  detail: ReasonDetail;
  question: ExerciseQuestion;
  /** Localized nudge for `H`; null when the item has nothing useful. */
  hint: string | null;
};

export type ExerciseAnswer =
  | { type: 'choice'; index: number }
  | { type: 'text'; value: string }
  | { type: 'dontKnow' };

export type Verdict = 'correct' | 'incorrect' | 'dontKnow';

/** When the item comes back for review (FSRS), independent of any stage change. */
export type Review = { kind: 'backSoon' } | { kind: 'backInDays'; days: number };

/** The single line shown under the answer: a stage crossing wins over the review. */
export type Consequence = { kind: 'stageCrossed'; concept: string; stage: StageValue } | Review;

export type ExerciseFeedback = {
  verdict: Verdict;
  /** Chosen option index, echoed so the player can mark it. */
  chosenIndex: number | null;
  /** Index of the correct option (choice) — revealed only after answering. */
  correctIndex: number | null;
  /** The correct filler, e.g. "boxes". */
  correctAnswer: string;
  /** The prompt with the gap filled by the correct answer. */
  answerSentence: string;
  /** One-line localized "why". */
  why: string;
  /** Optional longer note behind `?`. */
  more: string | null;
  consequence: Consequence;
  /**
   * Always present, even when `consequence` is a stage crossing — the
   * session summary needs both.
   */
  review: Review;
};

/** Strip the answer key: what the learner may see before answering. */
export function toQuestion(practice: Practice): ExerciseQuestion {
  return practice.type === 'choice'
    ? { type: 'choice', prompt: practice.prompt, options: [...practice.options] }
    : { type: 'cloze', prompt: practice.prompt };
}

/** Whole days since `ms`, never negative. */
export function daysSince(ms: number, now: number): number {
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

export function reasonDetail(args: {
  isNewConcept: boolean;
  unlockedByTitles: readonly string[];
  lastPracticedAt: number | null;
  now: number;
}): ReasonDetail {
  if (args.isNewConcept) {
    return args.unlockedByTitles.length > 0
      ? { kind: 'unlockedBy', concepts: [...args.unlockedByTitles] }
      : null;
  }
  return args.lastPracticedAt === null
    ? null
    : { kind: 'lastPractised', days: daysSince(args.lastPracticedAt, args.now) };
}

/**
 * The language of the learner-facing help in an item — the `H` hint and the
 * "why" — as opposed to the player's chrome, which follows the URL locale.
 *
 * - ru / uk / de chosen → that language, whatever the interface is in;
 * - `other` (none of these) → English, the content's source language — not
 *   the interface locale, which says nothing about the native one;
 * - not chosen (null) or a stored value outside the list → the interface
 *   locale, as before the choice existed. Nothing is ever written back.
 */
export function contentLocale(nativeLanguage: string | null, uiLocale: Locale): Locale {
  if (!isNativeLanguage(nativeLanguage)) return uiLocale;
  return nativeLanguage === 'other' ? 'en' : nativeLanguage;
}

/**
 * `H` nudge: the rule formula for grammar, the meaning for vocabulary. Not
 * the answer itself — for choice items the options still have to be read.
 */
export function hintFor(kind: ItemKindValue, content: ItemContent, locale: Locale): string | null {
  switch (kind) {
    case 'GRAMMAR_PATTERN':
      return 'pattern' in content.source ? content.source.pattern : null;
    case 'VOCAB_WORD':
    case 'COLLOCATION':
      return 'translation' in content.localized
        ? localized(content.localized.translation, locale)
        : null;
    case 'IDIOM':
      return 'meaning' in content.localized ? localized(content.localized.meaning, locale) : null;
  }
}

/** The localized "why" (one line) and an optional longer note. */
export function explanationFor(
  kind: ItemKindValue,
  content: ItemContent,
  locale: Locale,
): { why: string; more: string | null } {
  // The four kinds share field names where they overlap; read them uniformly.
  const l = content.localized as Partial<Record<string, LocalizedString>>;
  const text = (field: LocalizedString | undefined) => (field ? localized(field, locale) : null);
  const s = content.source as { headword?: string; phrase?: string };
  const term = s.headword ?? s.phrase ?? '';

  switch (kind) {
    case 'GRAMMAR_PATTERN':
      return { why: text(l.explanation) ?? '', more: text(l.usageNote) };
    case 'VOCAB_WORD':
      return {
        why: `${term} — ${text(l.translation) ?? ''}`,
        more: text(l.definition) ?? text(l.exampleTranslation),
      };
    case 'COLLOCATION':
      return { why: `${term} — ${text(l.translation) ?? ''}`, more: text(l.usageNote) };
    case 'IDIOM':
      return { why: `${term} — ${text(l.meaning) ?? ''}`, more: text(l.exampleTranslation) };
  }
}

export function correctAnswerOf(practice: Practice): string {
  return practice.type === 'choice'
    ? (practice.options[practice.correctIndex] as string)
    : (practice.acceptedAnswers[0] as string);
}

/** Prompt with the gap filled; "—" (zero article) collapses to nothing. */
export function fillGap(prompt: string, answer: string): string {
  const filler = answer === '—' ? '' : answer;
  return prompt
    .replace(PRACTICE_GAP, filler)
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Server-side grading. A malformed answer is graded incorrect, never correct. */
export function gradeAnswer(practice: Practice, answer: ExerciseAnswer): Verdict {
  if (answer.type === 'dontKnow') return 'dontKnow';
  if (practice.type === 'choice') {
    return answer.type === 'choice' && answer.index === practice.correctIndex
      ? 'correct'
      : 'incorrect';
  }
  return answer.type === 'text' && isClozeAnswerAccepted(practice, answer.value)
    ? 'correct'
    : 'incorrect';
}

export const STAGE_RANK: Record<StageValue, number> = {
  NOT_STARTED: 0,
  EMERGING: 1,
  DEVELOPING: 2,
  SOLID: 3,
  SECURE: 4,
};

/** Stored stage → learner-facing stage, without the FSRS Secure check. */
function shownStage(stage: MasteryStage): StageValue {
  return stage === 'HIGH_SOLID' ? 'SOLID' : stage;
}

/**
 * The stage worth announcing after an answer, or null. Only real progress
 * from Developing up: reaching Emerging is just "you started". HIGH_SOLID is
 * shown as Solid here — Secure needs FSRS stability (> 21 d) and is surfaced
 * on the dashboard, not mid-session.
 */
export function stageCrossing(before: MasteryStage, after: MasteryStage): StageValue | null {
  const a = shownStage(before);
  const b = shownStage(after);
  return STAGE_RANK[b] > STAGE_RANK[a] && STAGE_RANK[b] >= STAGE_RANK.DEVELOPING ? b : null;
}

/** `scheduledDays === 0` is a learning step after AGAIN: "Back soon", not "in 0 days". */
export function reviewFor(scheduledDays: number): Review {
  return scheduledDays <= 0
    ? { kind: 'backSoon' }
    : { kind: 'backInDays', days: Math.round(scheduledDays) };
}

/** Consequence line priority: stage crossing → "Back soon" → "Back in N days". */
export function consequenceFor(args: {
  conceptTitle: string;
  stageBefore: MasteryStage;
  stageAfter: MasteryStage;
  scheduledDays: number;
}): Consequence {
  const crossed = stageCrossing(args.stageBefore, args.stageAfter);
  if (crossed) return { kind: 'stageCrossed', concept: args.conceptTitle, stage: crossed };
  return reviewFor(args.scheduledDays);
}
