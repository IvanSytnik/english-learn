import { BktStateSchema, type BktState } from "../core/bkt/types";

/**
 * Adapter: pure BktState <-> Prisma ConceptMastery row.
 *
 * Structural row type — deliberately NOT imported from the generated Prisma
 * client, so the pure package compiles without `prisma generate` and the
 * coupling surface stays explicit. Field names match ConceptMastery 1:1.
 *
 * The only real conversion is lastUpdatedAt: number (pure core) <-> bigint
 * (Prisma BigInt column). Unix ms fits in a double until year ~287396, so
 * Number(bigint) is lossless here; we still guard against overflow.
 */

export type ConceptMasteryRow = {
  pKnown: number;
  pLearn: number;
  pSlip: number;
  pGuess: number;
  pForgetLambda: number;
  lastUpdatedAt: bigint;
  observationCount: number;
};

/** Values for prisma.conceptMastery.upsert create/update (state fields only). */
export type ConceptMasteryWrite = ConceptMasteryRow;

const MAX_SAFE_MS = BigInt(Number.MAX_SAFE_INTEGER);

export function rowToBktState(row: ConceptMasteryRow): BktState {
  if (row.lastUpdatedAt > MAX_SAFE_MS) {
    throw new RangeError(
      `ConceptMastery.lastUpdatedAt ${row.lastUpdatedAt} exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  return BktStateSchema.parse({
    pKnown: row.pKnown,
    pLearn: row.pLearn,
    pSlip: row.pSlip,
    pGuess: row.pGuess,
    pForgetLambda: row.pForgetLambda,
    lastUpdatedAt: Number(row.lastUpdatedAt),
    observationCount: row.observationCount,
  });
}

export function bktStateToRow(state: BktState): ConceptMasteryWrite {
  return {
    pKnown: state.pKnown,
    pLearn: state.pLearn,
    pSlip: state.pSlip,
    pGuess: state.pGuess,
    pForgetLambda: state.pForgetLambda,
    lastUpdatedAt: BigInt(state.lastUpdatedAt),
    observationCount: state.observationCount,
  };
}
