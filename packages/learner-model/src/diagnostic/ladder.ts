import type { CefrLevelValue, DiagnosticAxisValue } from '@englishlearn/db/schemas';
import { CEFR_RANK } from '../core/graph/types';
import { makeRng, seedFromString } from '../policy/rng';

/**
 * Diagnostic ladder (decision 2026-10-24, replaces the pseudo-CAT columns).
 *
 * A fixed 16-question placement: positions alternate GRAMMAR (even) / VOCAB
 * (odd), and each axis climbs its own ladder over A2..C1 — two right in a row
 * steps up, two wrong in a row (a don't-know is wrong) steps down, the streak
 * resets after every step attempt, and the ends clamp.
 *
 * Stateless by design: the whole state is a replay of the attempt's answers,
 * so nothing but DiagnosticAnswer rows is stored, and a question that was
 * served but not answered is simply recomputed — the same input always picks
 * the same item (seeded by attemptId + position, pool sorted by id).
 *
 * Pure: no DB, no clock, no Math.random.
 */

export const LADDER_LEVELS = ['A2', 'B1', 'B2', 'C1'] as const satisfies readonly CefrLevelValue[];
export type LadderLevel = (typeof LADDER_LEVELS)[number];
export const LADDER_START: LadderLevel = 'B1';
export const QUESTIONS_PER_AXIS = 8;
export const STREAK_TO_STEP = 2;
/** How many of an axis's last answers define its level. */
export const LEVEL_TAIL = 4;

export const LADDER_AXES = ['GRAMMAR', 'VOCAB'] as const satisfies readonly DiagnosticAxisValue[];
export type LadderAxis = (typeof LADDER_AXES)[number];
export const TOTAL_QUESTIONS = LADDER_AXES.length * QUESTIONS_PER_AXIS;

/** One answered question of the attempt (DiagnosticAnswer + its item). */
export type LadderAnswer = {
  position: number;
  axis: DiagnosticAxisValue;
  itemId: string;
  /** Level of the QUESTION answered (DiagnosticAnswer.itemLevel). */
  itemLevel: CefrLevelValue;
  correct: boolean;
  dontKnow: boolean;
};

/** A PUBLISHED diagnostic question the ladder may serve. */
export type LadderPoolItem = {
  id: string;
  axis: DiagnosticAxisValue;
  cefrLevel: CefrLevelValue;
};

export type LadderInput = {
  attemptId: string;
  answers: readonly LadderAnswer[];
  pool: readonly LadderPoolItem[];
};

export type LadderStep =
  | {
      kind: 'question';
      position: number;
      axis: LadderAxis;
      /** Where the axis's ladder stands; the item may sit on a neighbour level. */
      targetLevel: LadderLevel;
      itemId: string;
    }
  | {
      kind: 'complete';
      axes: { axis: LadderAxis; level: CefrLevelValue }[];
      assessedLevel: CefrLevelValue;
    }
  /** No unanswered question left on this axis at any level. */
  | { kind: 'exhausted'; axis: LadderAxis };

export function axisAtPosition(position: number): LadderAxis {
  return position % 2 === 0 ? 'GRAMMAR' : 'VOCAB';
}

const BY_RANK = new Map<number, CefrLevelValue>(
  (Object.keys(CEFR_RANK) as CefrLevelValue[]).map((l) => [CEFR_RANK[l], l]),
);

/** Mean of CEFR ranks, rounded DOWN (conservative), as a level. */
function floorMeanLevel(levels: readonly CefrLevelValue[]): CefrLevelValue {
  const mean = levels.reduce((sum, l) => sum + CEFR_RANK[l], 0) / levels.length;
  return BY_RANK.get(Math.floor(mean)) as CefrLevelValue;
}

/**
 * The ladder position after an axis's answers (in position order): START,
 * then ±1 per completed streak of STREAK_TO_STEP, clamped to A2..C1.
 */
export function ladderLevel(axisAnswers: readonly LadderAnswer[]): LadderLevel {
  let index = LADDER_LEVELS.indexOf(LADDER_START);
  let right = 0;
  let wrong = 0;
  for (const a of axisAnswers) {
    if (a.correct && !a.dontKnow) {
      right += 1;
      wrong = 0;
    } else {
      wrong += 1;
      right = 0;
    }
    if (right === STREAK_TO_STEP) {
      index = Math.min(index + 1, LADDER_LEVELS.length - 1);
      right = 0;
    } else if (wrong === STREAK_TO_STEP) {
      index = Math.max(index - 1, 0);
      wrong = 0;
    }
  }
  return LADDER_LEVELS[index] as LadderLevel;
}

/**
 * An axis's assessed level: the mean rank of the QUESTIONS (not the ladder
 * positions) behind its last LEVEL_TAIL answers, rounded down. Null when the
 * axis has no answers. Answers must be in position order.
 */
export function ladderAxisLevel(
  axisAnswers: readonly Pick<LadderAnswer, 'itemLevel'>[],
): CefrLevelValue | null {
  if (axisAnswers.length === 0) return null;
  return floorMeanLevel(axisAnswers.slice(-LEVEL_TAIL).map((a) => a.itemLevel));
}

/** The attempt's assessed level: the mean rank of its axis levels, rounded down. */
export function ladderAssessedLevel(axisLevels: readonly CefrLevelValue[]): CefrLevelValue {
  if (axisLevels.length === 0) throw new Error('ladder: no axis level to assess');
  return floorMeanLevel(axisLevels);
}

/** Throws on input only a bug can produce; returns answers in position order. */
function validated(answers: readonly LadderAnswer[]): LadderAnswer[] {
  const sorted = [...answers].sort((a, b) => a.position - b.position);
  const seen = new Set<string>();
  sorted.forEach((a, i) => {
    if (a.position !== i) throw new Error(`ladder: expected position ${i}, got ${a.position}`);
    if (a.position >= TOTAL_QUESTIONS) {
      throw new Error(`ladder: position ${a.position} is past the last question`);
    }
    if (a.axis !== axisAtPosition(a.position)) {
      throw new Error(`ladder: position ${a.position} must be ${axisAtPosition(a.position)}`);
    }
    if (seen.has(a.itemId)) throw new Error(`ladder: item ${a.itemId} answered twice`);
    seen.add(a.itemId);
  });
  return sorted;
}

/** What comes next in the attempt: a question, the result, or a dead end. */
export function nextLadderStep(input: LadderInput): LadderStep {
  const answers = validated(input.answers);
  const ofAxis = (axis: LadderAxis) => answers.filter((a) => a.axis === axis);

  if (answers.length === TOTAL_QUESTIONS) {
    const axes = LADDER_AXES.map((axis) => ({
      axis,
      level: ladderAxisLevel(ofAxis(axis)) as CefrLevelValue,
    }));
    return { kind: 'complete', axes, assessedLevel: ladderAssessedLevel(axes.map((a) => a.level)) };
  }

  const position = answers.length;
  const axis = axisAtPosition(position);
  const targetLevel = ladderLevel(ofAxis(axis));
  const answered = new Set(answers.map((a) => a.itemId));
  const candidates = input.pool.filter(
    (p) =>
      p.axis === axis &&
      (LADDER_LEVELS as readonly CefrLevelValue[]).includes(p.cefrLevel) &&
      !answered.has(p.id),
  );
  if (candidates.length === 0) return { kind: 'exhausted', axis };

  // Nearest level that still has a question; a tie goes to the lower level.
  const target = CEFR_RANK[targetLevel];
  const distance = (l: CefrLevelValue) => Math.abs(CEFR_RANK[l] - target);
  const level = candidates
    .map((p) => p.cefrLevel)
    .reduce((best, l) =>
      distance(l) < distance(best) ||
      (distance(l) === distance(best) && CEFR_RANK[l] < CEFR_RANK[best])
        ? l
        : best,
    );

  // The DB returns rows in no guaranteed order: sort before drawing.
  const atLevel = candidates
    .filter((p) => p.cefrLevel === level)
    .map((p) => p.id)
    .sort();
  const rng = makeRng(seedFromString(`${input.attemptId}:${position}`));
  const itemId = atLevel[Math.floor(rng.next() * atLevel.length)] as string;

  return { kind: 'question', position, axis, targetLevel, itemId };
}
