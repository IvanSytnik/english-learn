import { z } from 'zod';
// The attribute is required: Node's ESM loader (Playwright e2e helpers) refuses
// a JSON module without it; bundlers accept it.
import DATA from '../../data/cefr-j-v1.5-excluded.json' with { type: 'json' };

/**
 * Function words the catalogue leaves out (B6.7a, V2-18): every headword the
 * CEFR-J Wordlist lists as a determiner, modal auxiliary, be-/do-/have-verb
 * or infinitive-to (all levels), plus the be-/have-verb forms it omits —
 * the keys of ./shadowed.ts, generated into data/cefr-j-v1.5-excluded.json
 * by scripts/build-cefr-j-excluded.ts. The paste import shows them as
 * "function words — not practised"; they are never "not found", so never
 * material for generating a word (B6.10).
 */

const ExcludedDatasetSchema = z
  .object({
    source: z
      .object({ name: z.literal('CEFR-J Wordlist'), version: z.string().min(1) })
      .passthrough(),
    byPos: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
  })
  .strict();

/** The source's tag (`determiner`, `modal auxiliary`, …) → its headword keys. */
export const EXCLUDED_BY_POS: Readonly<Record<string, readonly string[]>> =
  ExcludedDatasetSchema.parse(DATA).byPos;

/** Every excluded headword key (lower case, as written: `have to`, `'s`). */
export const EXCLUDED_HEADWORDS: ReadonlySet<string> = new Set(
  Object.values(EXCLUDED_BY_POS).flat(),
);
