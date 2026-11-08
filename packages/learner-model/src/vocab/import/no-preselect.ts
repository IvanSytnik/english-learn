import { z } from 'zod';
// The attribute is required: Node's ESM loader (Playwright e2e helpers import
// this package) refuses a JSON module without it; bundlers accept it.
import DATA from '../../../data/paste-no-preselect.json' with { type: 'json' };

/**
 * PASTE_NO_PRESELECT (B6.7b, V2-19 #40): catalogue words the paste import
 * never preselects although they are open-class and not flagged
 * `shadowedByExcludedPos` — homographs of a function word the flag does not
 * cover (`IT` ← the pronoun `it`). Data with a reason each, never a heuristic
 * (V2-10); the test checks every slug against the catalogue.
 */

const NoPreselectSchema = z
  .object({
    note: z.string().min(1),
    entries: z.array(
      z
        .object({ slug: z.string().min(1), lemma: z.string().min(1), reason: z.string().min(1) })
        .strict(),
    ),
  })
  .strict();

export const PASTE_NO_PRESELECT_ENTRIES = NoPreselectSchema.parse(DATA).entries;

/** Slugs of the words never preselected by name. */
export const PASTE_NO_PRESELECT: ReadonlySet<string> = new Set(
  PASTE_NO_PRESELECT_ENTRIES.map((e) => e.slug),
);
