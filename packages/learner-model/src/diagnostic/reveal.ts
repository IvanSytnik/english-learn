import type { CefrLevelValue, DiagnosticAxisValue } from '@englishlearn/db/schemas';
import { CEFR_RANK, type ConceptId } from '../core/graph/types';
import { computeUnlocked, type GateMastery, isStarted } from '../policy/curriculum';
import { DEFAULT_POLICY_CONFIG, type PolicyConfig, type PrereqEdge } from '../policy/types';
import { MAPPING_V1 } from './bootstrap';
import { ladderAssessedLevel, ladderAxisLevel } from './ladder';
import type { DiagnosticAnswerFact } from './types';

/**
 * Placement reveal read model (E7, rebuilt on the ladder 2026-10-24).
 *
 * Builds the reveal from facts that already exist — the graded diagnostic
 * answers and the post-bootstrap mastery snapshots. Levels come from the
 * ladder's own formulas (`ladderAxisLevel`, `ladderAssessedLevel`), so the
 * reveal always says what the engine and the bootstrap estimator decided.
 * Deliberately NOT a per-concept "top 3": inside one axis the bootstrap
 * pKnown differs only by levelFactor, so concept ranking would be fake
 * precision (HANDOFF §7).
 *
 * Pure: the caller loads the facts (see @englishlearn/db/queries/diagnostic-reveal).
 */

export type RevealSkillTag = {
  id: string;
  slug: string;
  title: string;
  category: string;
};

export type RevealAnswerFact = Pick<
  DiagnosticAnswerFact,
  'axis' | 'correct' | 'dontKnow' | 'itemLevel' | 'position'
> & {
  /** DiagnosticItem.skillTag, or null for an untagged item. */
  skillTag: RevealSkillTag | null;
};

export type RevealConcept = {
  id: ConceptId;
  cefrLevel: CefrLevelValue;
};

export type PlacementRevealInput = {
  answers: readonly RevealAnswerFact[];
  /**
   * Concepts eligible as a starting point. Pass only concepts that have
   * PUBLISHED items — recommending a concept with nothing to practise is a
   * dead end.
   */
  concepts: readonly RevealConcept[];
  /** The learner's ConceptMastery snapshots right after bootstrap. */
  masteries: readonly GateMastery[];
  prereqEdges: readonly PrereqEdge[];
  config?: PolicyConfig;
};

export type StartConceptInput = Omit<PlacementRevealInput, 'answers'> & {
  /** The level to start near — the reveal's assessed level. */
  level: CefrLevelValue;
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

/**
 * One axis of the reveal. The level only — no correct/answered counts: the
 * ladder keeps everyone near 50 % correct, so a fraction would read as a
 * second, contradicting "level" (decision 2026-10-24, 2.а).
 */
export type AxisReveal = {
  axis: DiagnosticAxisValue;
  level: CefrLevelValue;
  /** Same bar as the bootstrap sparse-axis guard (MAPPING_V1.minAnswersPerAxis). */
  reliable: boolean;
};

export type PlacementReveal = {
  /** Mean of the axis levels, rounded down; null when nothing was answered. */
  level: CefrLevelValue | null;
  /** Axes that received at least one answer, in VOCAB/GRAMMAR/LISTENING order. */
  axes: AxisReveal[];
  /** Per skill tag, strongest first (accuracy desc, then answered desc, then slug). */
  skillTags: (AnswerTally & { tag: RevealSkillTag })[];
  untaggedAnswers: number;
  /** First recommended concept to practise, or null if none is eligible. */
  startConcept: ConceptId | null;
};

const AXIS_ORDER: readonly DiagnosticAxisValue[] = ['VOCAB', 'GRAMMAR', 'LISTENING'];

function tally(
  answers: readonly Pick<DiagnosticAnswerFact, 'correct' | 'dontKnow'>[],
): AnswerTally {
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
 * The concept to suggest first: unlocked, not yet practised, closest to the
 * given level (lower level wins a tie), weakest bootstrap prior next, id
 * last for determinism. Deterministic on purpose — this is copy on a page,
 * unlike the Thompson draw selectNext makes for the first exercise.
 */
export function pickStartConcept(input: StartConceptInput): ConceptId | null {
  const config = input.config ?? DEFAULT_POLICY_CONFIG;
  const ids = input.concepts.map((c) => c.id);
  const { unlocked } = computeUnlocked(ids, input.masteries, input.prereqEdges, config);
  const masteryById = new Map(input.masteries.map((m) => [m.conceptId, m]));
  const target = CEFR_RANK[input.level];

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
  const ordered = [...input.answers].sort((a, b) => a.position - b.position);
  const axes: AxisReveal[] = [];
  for (const axis of AXIS_ORDER) {
    const ofAxis = ordered.filter((a) => a.axis === axis);
    const level = ladderAxisLevel(ofAxis);
    if (level === null) continue;
    axes.push({ axis, level, reliable: ofAxis.length >= MAPPING_V1.minAnswersPerAxis });
  }
  const level = axes.length === 0 ? null : ladderAssessedLevel(axes.map((a) => a.level));

  const byTag = new Map<string, { tag: RevealSkillTag; answers: RevealAnswerFact[] }>();
  let untaggedAnswers = 0;
  for (const a of ordered) {
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
    level,
    axes,
    skillTags,
    untaggedAnswers,
    startConcept: level === null ? null : pickStartConcept({ ...input, level }),
  };
}
