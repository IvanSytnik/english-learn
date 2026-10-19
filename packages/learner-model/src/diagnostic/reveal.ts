import type { CefrLevelValue, DiagnosticAxisValue } from '@englishlearn/db/schemas';
import { CEFR_RANK, type ConceptId } from '../core/graph/types';
import { computeUnlocked, isStarted } from '../policy/curriculum';
import {
  type ConceptMasterySnapshot,
  DEFAULT_POLICY_CONFIG,
  type PolicyConfig,
  type PrereqEdge,
} from '../policy/types';
import { MAPPING_V1 } from './bootstrap';
import type { DiagnosticAnswerFact } from './types';

/**
 * Placement reveal read model (E7, decision 2026-10-19).
 *
 * Builds the letter-style reveal from facts that already exist — the graded
 * diagnostic answers and the post-bootstrap mastery snapshots. Deliberately
 * NOT a per-concept "top 3": inside one axis the bootstrap pKnown differs only
 * by levelFactor, so concept ranking would be fake precision (HANDOFF §7).
 *
 * Pure: the caller loads the facts (see @englishlearn/db/queries/diagnostic-reveal).
 */

export type RevealSkillTag = {
  id: string;
  slug: string;
  title: string;
  category: string;
};

export type RevealAnswerFact = DiagnosticAnswerFact & {
  /** DiagnosticItem.skillTag, or null for an untagged item. */
  skillTag: RevealSkillTag | null;
};

export type RevealConcept = {
  id: ConceptId;
  cefrLevel: CefrLevelValue;
};

export type PlacementRevealInput = {
  assessedLevel: CefrLevelValue;
  /** DiagnosticAttempt.levelTrajectory — the pseudo-CAT level per answered item. */
  levelTrajectory: readonly CefrLevelValue[];
  answers: readonly RevealAnswerFact[];
  /**
   * Concepts eligible as a starting point. Pass only concepts that have
   * PUBLISHED items — recommending a concept with nothing to practise is a
   * dead end.
   */
  concepts: readonly RevealConcept[];
  /** The learner's ConceptMastery snapshots right after bootstrap. */
  masteries: readonly ConceptMasterySnapshot[];
  prereqEdges: readonly PrereqEdge[];
  config?: PolicyConfig;
};

export type AnswerTally = {
  answered: number;
  correct: number;
  dontKnow: number;
  /** correct / answered, 0 when nothing was answered. */
  accuracy: number;
  /**
   * Enough answers to say something about this area. Same bar as the
   * bootstrap sparse-axis guard (MAPPING_V1.minAnswersPerAxis), so the reveal
   * never claims more than the bootstrap trusted.
   */
  reliable: boolean;
};

export type PlacementReveal = {
  level: CefrLevelValue;
  /** Where the pseudo-CAT settled; low === high when it never wavered. */
  band: { low: CefrLevelValue; high: CefrLevelValue };
  /** Axes that received at least one answer, in VOCAB/GRAMMAR/LISTENING order. */
  axes: (AnswerTally & { axis: DiagnosticAxisValue })[];
  /** Per skill tag, strongest first (accuracy desc, then answered desc, then slug). */
  skillTags: (AnswerTally & { tag: RevealSkillTag })[];
  untaggedAnswers: number;
  /** First recommended concept to practise, or null if none is eligible. */
  startConcept: ConceptId | null;
};

const AXIS_ORDER: readonly DiagnosticAxisValue[] = ['VOCAB', 'GRAMMAR', 'LISTENING'];

/** How many final trajectory steps define the band (where the CAT settled). */
export const BAND_TAIL = 4;

const BY_RANK = (Object.keys(CEFR_RANK) as CefrLevelValue[]).sort(
  (a, b) => CEFR_RANK[a] - CEFR_RANK[b],
);

function tally(answers: readonly DiagnosticAnswerFact[]): AnswerTally {
  let correct = 0;
  let dontKnow = 0;
  for (const a of answers) {
    if (a.dontKnow) dontKnow += 1;
    else if (a.correct) correct += 1;
  }
  const answered = answers.length;
  return {
    answered,
    correct,
    dontKnow,
    accuracy: answered === 0 ? 0 : correct / answered,
    reliable: answered >= MAPPING_V1.minAnswersPerAxis,
  };
}

/**
 * Band v1: min..max over the last BAND_TAIL trajectory levels, always
 * including assessedLevel. Early steps are the CAT still searching from its
 * B1 start, so they are excluded.
 */
export function placementBand(
  assessedLevel: CefrLevelValue,
  levelTrajectory: readonly CefrLevelValue[],
): { low: CefrLevelValue; high: CefrLevelValue } {
  const ranks = [...levelTrajectory.slice(-BAND_TAIL), assessedLevel].map((l) => CEFR_RANK[l]);
  return {
    low: BY_RANK[Math.min(...ranks)] as CefrLevelValue,
    high: BY_RANK[Math.max(...ranks)] as CefrLevelValue,
  };
}

/**
 * The concept to suggest first: unlocked, not yet practised, closest to the
 * assessed level (lower level wins a tie), weakest bootstrap prior next, id
 * last for determinism. Deterministic on purpose — this is copy on a page,
 * unlike the Thompson draw selectNext makes for the first exercise.
 */
export function pickStartConcept(input: PlacementRevealInput): ConceptId | null {
  const config = input.config ?? DEFAULT_POLICY_CONFIG;
  const ids = input.concepts.map((c) => c.id);
  const { unlocked } = computeUnlocked(ids, input.masteries, input.prereqEdges, config);
  const masteryById = new Map(input.masteries.map((m) => [m.conceptId, m]));
  const target = CEFR_RANK[input.assessedLevel];

  const eligible = input.concepts.filter(
    (c) => unlocked.has(c.id) && !isStarted(masteryById.get(c.id)),
  );
  eligible.sort((a, b) => {
    const da = Math.abs(CEFR_RANK[a.cefrLevel] - target);
    const db = Math.abs(CEFR_RANK[b.cefrLevel] - target);
    if (da !== db) return da - db;
    if (a.cefrLevel !== b.cefrLevel) return CEFR_RANK[a.cefrLevel] - CEFR_RANK[b.cefrLevel];
    const pa = masteryById.get(a.id)?.pKnown ?? 0;
    const pb = masteryById.get(b.id)?.pKnown ?? 0;
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return eligible[0]?.id ?? null;
}

export function buildPlacementReveal(input: PlacementRevealInput): PlacementReveal {
  const axes = AXIS_ORDER.map((axis) => ({
    axis,
    ...tally(input.answers.filter((a) => a.axis === axis)),
  })).filter((a) => a.answered > 0);

  const byTag = new Map<string, { tag: RevealSkillTag; answers: RevealAnswerFact[] }>();
  let untaggedAnswers = 0;
  for (const a of input.answers) {
    if (!a.skillTag) {
      untaggedAnswers += 1;
      continue;
    }
    const entry = byTag.get(a.skillTag.id) ?? { tag: a.skillTag, answers: [] };
    entry.answers.push(a);
    byTag.set(a.skillTag.id, entry);
  }
  const skillTags = [...byTag.values()]
    .map(({ tag, answers }) => ({ tag, ...tally(answers) }))
    .sort(
      (a, b) =>
        b.accuracy - a.accuracy ||
        b.answered - a.answered ||
        (a.tag.slug < b.tag.slug ? -1 : a.tag.slug > b.tag.slug ? 1 : 0),
    );

  return {
    level: input.assessedLevel,
    band: placementBand(input.assessedLevel, input.levelTrajectory),
    axes,
    skillTags,
    untaggedAnswers,
    startConcept: pickStartConcept(input),
  };
}
