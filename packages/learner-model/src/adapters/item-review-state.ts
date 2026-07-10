import { type FsrsCardState, FsrsCardStateSchema } from '../core/fsrs/types';

/**
 * Adapter: pure FsrsCardState <-> Prisma ItemReviewState row.
 *
 * Field names were designed to match 1:1 (see fsrs/types.ts), and bigints are
 * bigints on both sides, so this adapter is a validated spread. It exists as
 * a named seam anyway: if either side ever drifts, the drift surfaces HERE
 * (Zod parse / type error), not in five call sites.
 */

export type ItemReviewStateRow = {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  cardStatus: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
  dueAt: bigint;
  lastReviewAt: bigint | null;
};

/** Values for prisma.itemReviewState.upsert create/update (state fields only). */
export type ItemReviewStateWrite = ItemReviewStateRow;

export function rowToFsrsState(row: ItemReviewStateRow): FsrsCardState {
  return FsrsCardStateSchema.parse({
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    learningSteps: row.learningSteps,
    cardStatus: row.cardStatus,
    dueAt: row.dueAt,
    lastReviewAt: row.lastReviewAt,
  });
}

export function fsrsStateToRow(state: FsrsCardState): ItemReviewStateWrite {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    learningSteps: state.learningSteps,
    cardStatus: state.cardStatus,
    dueAt: state.dueAt,
    lastReviewAt: state.lastReviewAt,
  };
}
