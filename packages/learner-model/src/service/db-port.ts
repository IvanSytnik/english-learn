import type { ConceptMasteryRow, ConceptMasteryWrite } from '../adapters/concept-mastery';
import type { ItemReviewStateRow, ItemReviewStateWrite } from '../adapters/item-review-state';

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
  type: 'ITEM_ATTEMPTED' | 'LEARNER_BOOTSTRAPPED';
  /** Unix ms. */
  occurredAt: bigint;
  /** Pre-validated by the per-type payload schema — see event-store.ts. */
  payload: unknown;
};

export type LearnerEventRow = {
  id: string;
  userId: string;
  type: 'ITEM_ATTEMPTED' | 'LEARNER_BOOTSTRAPPED';
  occurredAt: bigint;
  payload: unknown;
};

/** Operations available inside a transaction. */
export type LearnerModelTx = {
  /**
   * Serialize every learner-model write for this user: blocks until no other
   * write transaction for the same user is open, released at commit/rollback
   * (transaction-scoped — a session lock would leak through the pooler).
   * MUST be the first call of every write transaction: under READ COMMITTED,
   * reading a snapshot and upserting it is otherwise a lost update, and the
   * event order would not match the order the projections were folded in.
   */
  lockUser(userId: string): Promise<void>;

  appendEvent(event: LearnerEventInsert): Promise<void>;

  /** occurredAt of the user's latest event, or null if they have none. */
  lastEventOccurredAt(userId: string): Promise<bigint | null>;

  /**
   * Whether the user already has an event of this type. Used by the bootstrap
   * strictly-once guard; race-free only because it runs after lockUser.
   */
  hasEventOfType(userId: string, type: LearnerEventInsert['type']): Promise<boolean>;

  getConceptMastery(userId: string, conceptId: string): Promise<ConceptMasteryRow | null>;
  /** Existing rows among `conceptIds` (missing concepts are simply absent). */
  getConceptMasteries(
    userId: string,
    conceptIds: readonly string[],
  ): Promise<(ConceptMasteryRow & { conceptId: string })[]>;
  upsertConceptMastery(
    userId: string,
    conceptId: string,
    write: ConceptMasteryWrite,
  ): Promise<void>;

  getItemReviewState(userId: string, itemId: string): Promise<ItemReviewStateRow | null>;
  upsertItemReviewState(userId: string, itemId: string, write: ItemReviewStateWrite): Promise<void>;

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
  /** PUBLISHED items that have a practice question (Item.content.practice). */
  getCandidateItems(userId: string): Promise<CandidateItemRow[]>;
  /**
   * What pickStartConcept needs beyond the selection reads: the assessed level
   * (StudentProfile.assessedLevel, null before the diagnostic or without a
   * profile) and every concept's CEFR level. Read only while no concept is
   * started.
   */
  getStartContext(userId: string): Promise<StartContextRow>;
};

export type StartContextRow = {
  level: CefrLevelRow | null;
  concepts: { id: string; cefrLevel: CefrLevelRow }[];
};

type CefrLevelRow = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

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
  kind: 'PREREQUISITE' | 'RELATED' | 'CONTRASTS_WITH' | 'PART_OF';
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
  cefrLevel: CefrLevelRow;
  /** Next-due Unix ms, or null if no ItemReviewState row for this (user,item). */
  dueAt: bigint | null;
  /** Last review Unix ms, or null if never reviewed (or no ItemReviewState row). */
  lastReviewAt: bigint | null;
};
