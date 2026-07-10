import type { ConceptMasteryRow, ConceptMasteryWrite } from "../adapters/concept-mastery";
import type {
  ItemReviewStateRow,
  ItemReviewStateWrite,
} from "../adapters/item-review-state";

/**
 * Persistence port for the learner-model service layer.
 *
 * Repository-style on purpose: the service talks in domain operations, not in
 * Prisma call shapes. Benefits:
 *   - unit tests fake this interface with a plain object (no Prisma mocking),
 *   - the pure package still compiles without `prisma generate`,
 *   - Prisma's generic signatures never leak into service code.
 *
 * The ONE Prisma-backed implementation lives in prisma-db.ts.
 */

export type ItemForOutcome = {
  conceptId: string;
  irtDiscrimination: number;
  irtDifficulty: number;
};

export type LearnerEventInsert = {
  userId: string;
  type: "ITEM_ATTEMPTED";
  /** Unix ms. */
  occurredAt: bigint;
  /** Pre-validated by ItemAttemptedPayloadSchema — see event-store.ts. */
  payload: unknown;
};

export type LearnerEventRow = {
  id: string;
  userId: string;
  type: "ITEM_ATTEMPTED";
  occurredAt: bigint;
  payload: unknown;
};

/** Operations available inside a transaction. */
export type LearnerModelTx = {
  appendEvent(event: LearnerEventInsert): Promise<void>;

  getConceptMastery(
    userId: string,
    conceptId: string,
  ): Promise<ConceptMasteryRow | null>;
  upsertConceptMastery(
    userId: string,
    conceptId: string,
    write: ConceptMasteryWrite,
  ): Promise<void>;

  getItemReviewState(
    userId: string,
    itemId: string,
  ): Promise<ItemReviewStateRow | null>;
  upsertItemReviewState(
    userId: string,
    itemId: string,
    write: ItemReviewStateWrite,
  ): Promise<void>;

  /** Replay only: wipe both projections for a user before rebuilding. */
  deleteSnapshots(userId: string): Promise<void>;

  /**
   * Replay only: page of events strictly after the cursor, ordered by
   * (occurredAt asc, id asc). Cursor null = from the beginning.
   */
  listEventsAsc(
    userId: string,
    cursor: { occurredAt: bigint; id: string } | null,
    limit: number,
  ): Promise<LearnerEventRow[]>;
};

export type LearnerModelDb = {
  /** Read outside any transaction (item metadata is effectively static). */
  getItemForOutcome(itemId: string): Promise<ItemForOutcome | null>;

  /**
   * Run `fn` atomically. Everything recordOutcome writes (event + both
   * projections) happens inside one of these — all or nothing.
   */
  runInTx<R>(fn: (tx: LearnerModelTx) => Promise<R>): Promise<R>;
  
  getMasterySnapshots(userId: string): Promise<MasterySnapshotRow[]>;
  getPrereqEdges(): Promise<PrereqEdgeRow[]>;
  getConceptEventCounts(userId: string): Promise<ConceptCountsRow[]>;
  getCandidateItems(userId: string): Promise<CandidateItemRow[]>;
  
};

export type MasterySnapshotRow = {
  conceptId: string;
  pKnown: number;
  observationCount: number;
  lastUpdatedAt: bigint;
  pForgetLambda: number;
};

export type PrereqEdgeRow = {
  from: string;
  to: string;
  kind: "PREREQUISITE" | "RELATED" | "CONTRASTS_WITH" | "PART_OF";
};

export type ConceptCountsRow = {
  conceptId: string;
  correct: number;
  incorrect: number;
};

export type CandidateItemRow = {
  itemId: string;
  conceptId: string;
  irtDiscrimination: number;
  irtDifficulty: number;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** Next-due Unix ms, or null if no ItemReviewState row for this (user,item). */
  dueAt: bigint | null;
};