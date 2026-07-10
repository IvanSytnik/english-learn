/**
 * Core graph types.
 *
 * Pure types — no Prisma, no I/O. The graph layer operates on plain objects
 * so it can be unit-tested at thousands of property-based runs per second
 * and reused on edge runtimes that don't ship Prisma.
 *
 * These mirror the Prisma enums (Concept.cefrLevel, ConceptCategory, EdgeKind)
 * 1:1 — keep them in sync. The Prisma schema is the database contract; this
 * file is the in-memory contract.
 */

import { z } from 'zod';

// -----------------------------------------------------------------------------
// CEFR
// -----------------------------------------------------------------------------

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CEFRLevel = (typeof CEFR_LEVELS)[number];

/**
 * Numeric rank — used for ordering, distance metrics, and IRT difficulty defaults.
 * A1 = 0, C2 = 5.
 */
export const CEFR_RANK: Readonly<Record<CEFRLevel, number>> = Object.freeze({
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
});

// -----------------------------------------------------------------------------
// Concept categories & edge kinds
// -----------------------------------------------------------------------------

export const CONCEPT_CATEGORIES = [
  'GRAMMAR',
  'VOCAB',
  'LISTENING',
  'PHONETICS',
  'DISCOURSE',
  'PRAGMATICS',
] as const;
export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number];

export const EDGE_KINDS = ['PREREQUISITE', 'RELATED', 'CONTRASTS_WITH', 'PART_OF'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

// -----------------------------------------------------------------------------
// Concept ID schema — human-readable, namespaced
// -----------------------------------------------------------------------------

/**
 * Concept IDs are dotted, lowercase, snake-cased segments.
 *
 * Valid:   present_perfect.with_for_since
 *          phrasal_verbs.travel
 *          vocab.travel.airport
 *
 * Invalid: PresentPerfect, present-perfect, present perfect, 1concept
 *
 * Rules:
 *   - 1..6 segments
 *   - each segment: [a-z][a-z0-9_]{0,31}
 *   - total length <= 96 chars
 *
 * Once assigned, a Concept ID is immutable. Renaming requires a ConceptAlias
 * row (to be introduced in Week 2 when needed).
 */
const CONCEPT_ID_SEGMENT = /^[a-z][a-z0-9_]{0,31}$/;

export const ConceptIdSchema = z
  .string()
  .min(1)
  .max(96)
  .refine(
    (id) => {
      const segments = id.split('.');
      if (segments.length < 1 || segments.length > 6) return false;
      return segments.every((s) => CONCEPT_ID_SEGMENT.test(s));
    },
    {
      message:
        'Concept ID must be 1..6 dotted lowercase snake_case segments, each [a-z][a-z0-9_]{0,31}',
    },
  );

export type ConceptId = z.infer<typeof ConceptIdSchema>;

// -----------------------------------------------------------------------------
// Concept & edge schemas
// -----------------------------------------------------------------------------

export const ConceptSchema = z.object({
  id: ConceptIdSchema,
  name: z.string().min(1).max(200),
  cefrLevel: z.enum(CEFR_LEVELS),
  category: z.enum(CONCEPT_CATEGORIES),
  description: z.string().max(2000).optional(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptEdgeSchema = z
  .object({
    from: ConceptIdSchema,
    to: ConceptIdSchema,
    kind: z.enum(EDGE_KINDS),
    weight: z.number().min(0).max(1).default(1.0),
  })
  .refine((e) => e.from !== e.to, {
    message: 'Self-loops are not allowed',
  });

export type ConceptEdge = z.infer<typeof ConceptEdgeSchema>;

// -----------------------------------------------------------------------------
// ConceptGraph — in-memory representation
// -----------------------------------------------------------------------------

/**
 * Immutable in-memory graph.
 *
 * The graph is the source of truth for traversal logic. Construct it once
 * per request (or cache it) from `seed/concepts/*` or from the DB via the
 * graph repository adapter (Week 1, Day 7).
 */
export interface ConceptGraph {
  readonly concepts: ReadonlyMap<ConceptId, Concept>;
  readonly edges: readonly ConceptEdge[];
  /** Outgoing edges by source. */
  readonly outgoing: ReadonlyMap<ConceptId, readonly ConceptEdge[]>;
  /** Incoming edges by target. */
  readonly incoming: ReadonlyMap<ConceptId, readonly ConceptEdge[]>;
}
