import { select } from "../policy/select";
import { makeRng } from "../policy/rng";
import {
  DEFAULT_POLICY_CONFIG,
  type PolicyConfig,
  type SelectionInput,
  type SelectionOutcome,
} from "../policy/types";
import type { LearnerModelDb } from "./db-port";

/**
 * SelectionService: the single read path that answers "what should this user
 * do next?".
 *
 * Symmetric to LearnerService (the single write path): the write path folds an
 * outcome into projections; this read path folds current projections into a
 * choice. Both talk only to the LearnerModelDb port — no Prisma here.
 *
 * READ-ONLY. No transaction: the four reads are independent snapshots and a
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
};

export function createSelectionService(db: LearnerModelDb) {
  return {
    async selectNext(input: SelectNextInput): Promise<SelectionOutcome> {
      const now = input.nowMs ?? Date.now();
      const config = input.config ?? DEFAULT_POLICY_CONFIG;

      // Derive a seed if none given. Truncation to uint32 is fine — mulberry32
      // coerces internally; we only need per-call variation in prod.
      const seed = input.seed ?? (now ^ hashString(input.userId)) >>> 0;
      const rng = makeRng(seed);

      const [masteryRows, prereqRows, countRows, candidateRows] =
        await Promise.all([
          db.getMasterySnapshots(input.userId),
          db.getPrereqEdges(),
          db.getConceptEventCounts(input.userId),
          db.getCandidateItems(input.userId),
        ]);

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
        candidates: candidateRows.map((r) => ({
          itemId: r.itemId,
          conceptId: r.conceptId,
          irtDiscrimination: r.irtDiscrimination,
          irtDifficulty: r.irtDifficulty,
          cefrLevel: r.cefrLevel,
          dueAt: r.dueAt === null ? null : Number(r.dueAt),
        })),
        config,
      };

      return select(selectionInput, rng);
    },
  };
}

export type SelectionService = ReturnType<typeof createSelectionService>;

/** Cheap deterministic string hash (djb2) — used only to vary the prod seed. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
