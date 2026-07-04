import type { ItemKindValue as ItemKind } from "@englishlearn/db/schemas";

/**
 * Shape of a seed item. `content` is intentionally `unknown` here — run.ts
 * validates every payload against the kind-matched Zod schema before insert,
 * so a malformed seed fails loudly at seed time, not at read time.
 */
export type SeedItem = {
  /** Stable ID: "item.<concept-short>.<slug>". Never change once shipped. */
  id: string;
  conceptId: string;
  kind: ItemKind;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  content: unknown;
  /** IRT overrides; defaults a=1.0 b=0.0 apply when omitted. */
  irtDiscrimination?: number;
  irtDifficulty?: number;
};
