import { vocabModeFor } from './ladder';
import type { VocabCandidate } from './select';
import type { VocabMode } from './types';

/**
 * The learner's vocabulary at a glance (B2.6, `/words`): how far each word
 * is, as a semantic stage — never its FSRS numbers (Axiom 4). Pure, from the
 * same candidates the session selects from.
 *
 * A word's stage is the ladder rung it is practised on, so the overview and
 * the session always agree:
 *   new      — never answered;
 *   learning — modes 1–2 (recognition: choose the meaning / the word);
 *   familiar — mode 3 (cloze);
 *   known    — mode 4 (cued recall);
 *   mastered — mode 5 (full recall).
 */

export const WORD_STAGES = ['new', 'learning', 'familiar', 'known', 'mastered'] as const;
export type WordStage = (typeof WORD_STAGES)[number];

const STAGE_OF_MODE: Readonly<Record<VocabMode, WordStage>> = Object.freeze({
  en_to_l1: 'learning',
  l1_to_en: 'learning',
  cloze: 'familiar',
  cued_recall: 'known',
  full_recall: 'mastered',
});

export function wordStage(review: VocabCandidate['review']): WordStage {
  if (review === null || review.cardStatus === 'NEW') return 'new';
  return STAGE_OF_MODE[vocabModeFor(review)];
}

export type StageCounts = Record<WordStage, number>;

export type VocabConceptProgress = {
  conceptId: string;
  total: number;
  /** Words answered at least once. */
  started: number;
  stages: StageCounts;
};

export type VocabSummary = {
  /** Words in (re)learning or review whose due moment has come. */
  dueNow: number;
  stages: StageCounts;
  /** One row per topic concept, sorted by concept id. */
  concepts: VocabConceptProgress[];
};

const emptyStages = (): StageCounts => ({
  new: 0,
  learning: 0,
  familiar: 0,
  known: 0,
  mastered: 0,
});

export function summarizeVocab(
  candidates: readonly (VocabCandidate & { conceptId: string })[],
  nowMs: number,
): VocabSummary {
  const now = BigInt(Math.floor(nowMs));
  const stages = emptyStages();
  const byConcept = new Map<string, VocabConceptProgress>();
  let dueNow = 0;

  for (const c of candidates) {
    const stage = wordStage(c.review);
    stages[stage] += 1;
    if (c.review && c.review.cardStatus !== 'NEW' && c.review.dueAt <= now) dueNow += 1;

    let row = byConcept.get(c.conceptId);
    if (!row) {
      row = { conceptId: c.conceptId, total: 0, started: 0, stages: emptyStages() };
      byConcept.set(c.conceptId, row);
    }
    row.total += 1;
    if (stage !== 'new') row.started += 1;
    row.stages[stage] += 1;
  }

  const concepts = [...byConcept.values()].sort((a, b) =>
    a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0,
  );
  return { dueNow, stages, concepts };
}
