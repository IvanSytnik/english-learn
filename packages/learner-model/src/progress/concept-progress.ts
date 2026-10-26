import type { CefrLevelValue } from '@englishlearn/db/schemas';
import {
  CEFR_RANK,
  CONCEPT_CATEGORIES,
  type ConceptCategory,
  type ConceptId,
} from '../core/graph/types';
import { pickStartConcept } from '../diagnostic/reveal';
import {
  computeEffectiveStage,
  type EffectiveStage,
  isFading,
  type MasteryStage,
} from '../mastery';
import { computeUnlocked, type GateMastery, isMastered, isStarted } from '../policy/curriculum';
import { DEFAULT_POLICY_CONFIG, type PolicyConfig, type PrereqEdge } from '../policy/types';

/**
 * Dashboard concept list (HANDOFF §9 п. 2): one learner-facing row per
 * practisable concept. Pure: no I/O, no Date.now().
 *
 * The output is the learner-facing shape — no pKnown, no raw review states.
 * Every decision that could disagree with another screen reuses that
 * screen's code: the lock is selection's `computeUnlocked`, the recommended
 * start is the diagnostic result's `pickStartConcept`.
 */

export type FsrsCardStatusValue = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';

/** Structurally matches @englishlearn/db `getConceptProgress` plus the caller's context. */
export type ConceptProgressInput = {
  /** Concepts with something to practise (selection's candidate filter). */
  concepts: readonly {
    id: ConceptId;
    title: string;
    cefrLevel: CefrLevelValue;
    category: ConceptCategory;
    /** Practisable items of the concept, touched or not. */
    itemCount: number;
  }[];
  masteries: readonly (GateMastery & { displayStage: MasteryStage })[];
  /** The learner's REVIEWED practisable items (lastReviewAt set). */
  reviews: readonly {
    conceptId: ConceptId;
    stability: number;
    cardStatus: FsrsCardStatusValue;
    /** Unix ms. */
    dueAt: number;
    /** Unix ms. */
    lastReviewAt: number;
  }[];
  prereqEdges: readonly PrereqEdge[];
  /**
   * The learner's assessed level (StudentProfile.assessedLevel). Null → no
   * recommended start.
   */
  level: CefrLevelValue | null;
  /** Unix ms. */
  now: number;
  config?: PolicyConfig;
};

/** Another concept, by id and learner-facing title (never empty). */
export type ConceptRef = { id: ConceptId; title: string };

export type ConceptProgressView = {
  id: ConceptId;
  title: string;
  cefrLevel: CefrLevelValue;
  category: ConceptCategory;
  stage: EffectiveStage;
  /** "Due for review": a REVIEW-status item is due. Overlay — never changes `stage`. */
  isFading: boolean;
  /** Closed by the prerequisite gate — selection will not introduce it. */
  isLocked: boolean;
  /**
   * The unmet prerequisites keeping it locked (pKnown below the gate). Empty
   * when unlocked — and, rarely, when locked by a concept with nothing to
   * practise (no title to show).
   */
  lockedBy: ConceptRef[];
  /** The diagnostic result's start concept, while nothing is started yet. */
  isRecommendedStart: boolean;
  /** Items answered at least once, out of `itemCount`. */
  practicedItemCount: number;
  itemCount: number;
  /** Unix ms of the latest review of any item, or null. */
  lastPracticedAt: number | null;
  /** Direct prerequisites. */
  requires: ConceptRef[];
  /** Direct dependents. */
  unlocks: ConceptRef[];
};

export type ConceptProgressSection = {
  category: ConceptCategory;
  concepts: ConceptProgressView[];
};

export type ConceptProgressBoard = {
  /** Non-empty sections in CONCEPT_CATEGORIES order (grammar, then vocabulary, …). */
  sections: ConceptProgressSection[];
  /** Concepts with `isFading` — the "Review (N topics)" CTA. */
  fadingCount: number;
};

/**
 * Stabilities for the SECURE check, padded with 0 for every practisable item
 * not reviewed yet: a concept is only durably remembered when most of its
 * items are, not the one item practised so far. Never pads below the
 * reviews themselves (an item can become practisable between two reads).
 */
function paddedStabilities(stabilities: readonly number[], itemCount: number): number[] {
  const missing = Math.max(0, itemCount - stabilities.length);
  return [...stabilities, ...new Array<number>(missing).fill(0)];
}

export function buildConceptProgress(input: ConceptProgressInput): ConceptProgressBoard {
  const config = input.config ?? DEFAULT_POLICY_CONFIG;
  const titleById = new Map(input.concepts.map((c) => [c.id, c.title]));
  const masteryById = new Map(input.masteries.map((m) => [m.conceptId, m]));

  const reviewsByConcept = new Map<ConceptId, ConceptProgressInput['reviews'][number][]>();
  for (const r of input.reviews) {
    const list = reviewsByConcept.get(r.conceptId) ?? [];
    list.push(r);
    reviewsByConcept.set(r.conceptId, list);
  }

  const parentsOf = new Map<ConceptId, ConceptId[]>();
  const childrenOf = new Map<ConceptId, ConceptId[]>();
  for (const e of input.prereqEdges) {
    if (e.kind !== 'PREREQUISITE') continue;
    parentsOf.set(e.to, [...(parentsOf.get(e.to) ?? []), e.from]);
    childrenOf.set(e.from, [...(childrenOf.get(e.from) ?? []), e.to]);
  }
  // Titled refs only: a concept outside the practisable set has no title.
  const refs = (ids: readonly ConceptId[] | undefined): ConceptRef[] =>
    [...new Set(ids ?? [])]
      .flatMap((id) => {
        const title = titleById.get(id);
        return title ? [{ id, title }] : [];
      })
      .sort(byId);

  const ids = input.concepts.map((c) => c.id);
  const { locked } = computeUnlocked(ids, input.masteries, input.prereqEdges, config);

  const nothingStarted = input.masteries.every((m) => !isStarted(m));
  const recommended =
    input.level !== null && nothingStarted
      ? pickStartConcept({
          concepts: input.concepts,
          masteries: input.masteries,
          prereqEdges: input.prereqEdges,
          level: input.level,
          config,
        })
      : null;

  const views = input.concepts.map((c): ConceptProgressView => {
    const mastery = masteryById.get(c.id);
    const reviews = reviewsByConcept.get(c.id) ?? [];
    const isLocked = locked.has(c.id);
    return {
      id: c.id,
      title: c.title,
      cefrLevel: c.cefrLevel,
      category: c.category,
      stage: computeEffectiveStage(
        mastery?.displayStage ?? 'NOT_STARTED',
        paddedStabilities(
          reviews.map((r) => r.stability),
          c.itemCount,
        ),
      ),
      // LEARNING / RELEARNING come back within minutes of a miss: inside the
      // session, not "due for review" on the dashboard.
      isFading: isFading(
        reviews.filter((r) => r.cardStatus === 'REVIEW').map((r) => r.dueAt),
        input.now,
      ),
      isLocked,
      lockedBy: isLocked
        ? refs(parentsOf.get(c.id)?.filter((p) => !isMastered(masteryById.get(p), config)))
        : [],
      isRecommendedStart: c.id === recommended,
      practicedItemCount: Math.min(reviews.length, c.itemCount),
      itemCount: c.itemCount,
      lastPracticedAt:
        reviews.length === 0 ? null : Math.max(...reviews.map((r) => r.lastReviewAt)),
      requires: refs(parentsOf.get(c.id)),
      unlocks: refs(childrenOf.get(c.id)),
    };
  });

  const sections = CONCEPT_CATEGORIES.map((category) => ({
    category,
    concepts: views
      .filter((v) => v.category === category)
      .sort((a, b) => CEFR_RANK[a.cefrLevel] - CEFR_RANK[b.cefrLevel] || byId(a, b)),
  })).filter((s) => s.concepts.length > 0);

  return { sections, fadingCount: views.filter((v) => v.isFading).length };
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
