import { z } from 'zod';
// The attribute is required: Node's ESM loader (Playwright e2e helpers import
// this package) refuses a JSON module without it; bundlers accept it.
import DATA from '../../../data/contractions.json' with { type: 'json' };

/**
 * Contractions of function words (B6.7b, V2-19 #41): `i'm`, `it's`, `don't`,
 * `can't`, … — the paste import shows them in the function-words group,
 * never as "not found", so they never reach a generation payload (B6.10).
 * The catalogue is matched first (`o'clock` stays a word). Committed data:
 * each contraction with the words it stands for; the test checks that every
 * one of those is an excluded function word or a catalogue word.
 */

const ContractionsSchema = z
  .object({
    note: z.string().min(1),
    contractions: z.record(z.string().min(1), z.array(z.string().min(1)).min(2)),
  })
  .strict();

/** Contraction (normalized like a pasted term) → the words it stands for. */
export const CONTRACTIONS: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(ContractionsSchema.parse(DATA).contractions),
);
