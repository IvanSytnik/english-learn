import { CEFR_RANK, type CEFRLevel } from '../core/graph/types';
import { pickStartConcept } from '../diagnostic/reveal';
import { isStarted } from '../policy/curriculum';
import { levelGuard } from '../policy/level-guard';
import { makeRng, seedFromString } from '../policy/rng';
import { select } from '../policy/select';
import {
  DEFAULT_POLICY_CONFIG,
  type PolicyConfig,
  type SelectionInput,
  type SelectionOutcome,
} from '../policy/types';
import type {
  CandidateItemRow,
  LearnerModelDb,
  LevelContextRow,
  MasterySnapshotRow,
  PrereqEdgeRow,
} from './db-port';

/**
 * SelectionService: the single read path that answers "what should this user
 * do next?".
 *
 * Symmetric to LearnerService (the single write path): the write path folds an
 * outcome into projections; this read path folds current projections into a
 * choice. Both talk only to the LearnerModelDb port — no Prisma here.
 *
 * READ-ONLY. No transaction: the reads are independent snapshots and a
 * stale read between them is harmless (worst case the learner gets a slightly
 * out-of-date candidate, self-correcting on the next call). Wrapping them in a
 * tx would hold a lock for zero benefit.
 */

export type SelectNextInput = {
  userId: string;
  /** "now" as Unix ms. Tests/backfills pass it; prod omits -> Date.now(). */
  nowMs?: number;
  /**
   * Seed for the Thompson draws. Prod omits it and gets a per-call seed derived
   * from the clock; tests pass a fixed integer for reproducibility. NOTE: the
   * seed is NOT persisted (decision 3.а: selection is stateless, not an event).
   */
  seed?: number;
  /** Optional config override; defaults to DEFAULT_POLICY_CONFIG. */
  config?: PolicyConfig;
  /**
   * Items to skip this call — the player passes the last few it showed, so a
   * just-failed card (due again in a minute) is not served straight back.
   * Ignored when it would leave no candidate.
   */
  excludeItemIds?: readonly string[];
};

export function createSelectionService(db: LearnerModelDb) {
  return {
    async selectNext(input: SelectNextInput): Promise<SelectionOutcome> {
      const now = input.nowMs ?? Date.now();
      const config = input.config ?? DEFAULT_POLICY_CONFIG;

      // Derive a seed if none given. Truncation to uint32 is fine — mulberry32
      // coerces internally; we only need per-call variation in prod.
      const seed = input.seed ?? (now ^ seedFromString(input.userId)) >>> 0;
      const rng = makeRng(seed);

      const [masteryRows, prereqRows, countRows, candidateRows, levelContext] = await Promise.all([
        db.getMasterySnapshots(input.userId),
        db.getPrereqEdges(),
        db.getConceptEventCounts(input.userId),
        db.getCandidateItems(input.userId),
        db.getLevelContext(input.userId),
      ]);

      const startConceptId = startConceptFor(levelContext, {
        masteries: masteryRows,
        prereqEdges: prereqRows,
        candidates: candidateRows,
        config,
      });

      const excluded = new Set(input.excludeItemIds ?? []);
      const allowedRows = candidateRows.filter((r) => !excluded.has(r.itemId));
      const pool = allowedRows.length > 0 ? allowedRows : candidateRows;
      // The guard's content bounds come from the pool select() sees, so both cap alike.
      const learnerLevel = await learnerLevelFor(db, input.userId, levelContext, pool, config);

      const selectionInput: SelectionInput = {
        userId: input.userId,
        now,
        masteries: masteryRows.map((r) => ({
          conceptId: r.conceptId,
          pKnown: r.pKnown,
          observationCount: r.observationCount,
          lastUpdatedAt: Number(r.lastUpdatedAt),
          pForgetLambda: r.pForgetLambda,
        })),
        eventCounts: countRows.map((r) => ({
          conceptId: r.conceptId,
          correct: r.correct,
          incorrect: r.incorrect,
        })),
        prereqEdges: prereqRows.map((r) => ({
          from: r.from,
          to: r.to,
          kind: r.kind,
        })),
        candidates: pool.map((r) => ({
          itemId: r.itemId,
          conceptId: r.conceptId,
          irtDiscrimination: r.irtDiscrimination,
          irtDifficulty: r.irtDifficulty,
          cefrLevel: r.cefrLevel,
          dueAt: r.dueAt === null ? null : Number(r.dueAt),
          lastReviewAt: r.lastReviewAt === null ? null : Number(r.lastReviewAt),
        })),
        config,
        startConceptId,
        ...(learnerLevel
          ? {
              learnerLevel: { theta: learnerLevel.theta },
              conceptLevels: learnerLevel.conceptLevels,
            }
          : {}),
      };

      return select(selectionInput, rng);
    },
  };
}

export type SelectionService = ReturnType<typeof createSelectionService>;

/**
 * The diagnostic's suggested first concept — the one the result screen and
 * the dashboard name — under the dashboard's own condition: no concept
 * started yet and an assessed level. Concepts are those with a candidate item
 * (the practisable set), so the three surfaces agree by construction.
 */
function startConceptFor(
  context: LevelContextRow,
  reads: {
    masteries: readonly MasterySnapshotRow[];
    prereqEdges: readonly PrereqEdgeRow[];
    candidates: readonly CandidateItemRow[];
    config: PolicyConfig;
  },
): string | null {
  if (reads.candidates.length === 0 || reads.masteries.some((m) => isStarted(m))) return null;
  if (context.level === null) return null;
  const practisable = new Set(reads.candidates.map((c) => c.conceptId));
  return pickStartConcept({
    concepts: context.concepts.filter((c) => practisable.has(c.id)),
    masteries: reads.masteries,
    prereqEdges: reads.prereqEdges,
    level: context.level,
    config: reads.config,
  });
}

/**
 * The learner's working level for V6b (§8 #19): the assessed level corrected
 * by the level guard over the practice since the bootstrap. Null — today's
 * policy — when level-aware selection is off, before the diagnostic, or with
 * nothing to practise. Outcomes are read only on this path.
 */
async function learnerLevelFor(
  db: LearnerModelDb,
  userId: string,
  context: LevelContextRow,
  candidates: readonly CandidateItemRow[],
  config: PolicyConfig,
): Promise<{ theta: number; conceptLevels: Record<string, CEFRLevel> } | null> {
  if (!config.levelAware || context.level === null || candidates.length === 0) return null;

  const conceptLevels: Record<string, CEFRLevel> = {};
  for (const c of context.concepts) conceptLevels[c.id] = c.cefrLevel;
  // A concept's rank: Concept.cefrLevel, else its candidate item's level (as select does).
  const rankOf = new Map<string, number>();
  for (const c of candidates) {
    if (!rankOf.has(c.conceptId)) {
      rankOf.set(c.conceptId, CEFR_RANK[conceptLevels[c.conceptId] ?? c.cefrLevel]);
    }
  }
  const practisable = [...rankOf.values()];
  for (const [id, level] of Object.entries(conceptLevels)) {
    if (!rankOf.has(id)) rankOf.set(id, CEFR_RANK[level]);
  }

  const outcomes = await db.getAttemptOutcomes(userId);
  const { theta } = levelGuard({
    placedRank: CEFR_RANK[context.level],
    // An outcome on a concept with no known level says nothing about the level.
    outcomes: outcomes.flatMap((o) => {
      const rank = rankOf.get(o.conceptId);
      return rank === undefined ? [] : [{ rank, correct: o.correct, hinted: o.hinted }];
    }),
    minRank: Math.min(...practisable),
    maxRank: Math.max(...practisable),
    config: config.levelPolicy.guard,
  });
  return { theta, conceptLevels };
}
