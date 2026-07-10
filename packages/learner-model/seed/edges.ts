/**
 * Seed edges for the initial Knowledge Graph.
 *
 * Edge semantics — read each line as "<from> is a prerequisite of <to>"
 * for PREREQUISITE edges:
 *
 *   past_participle  --PREREQUISITE-->  present_perfect_basic
 *     "Present Perfect requires knowing the past participle."
 *
 * For CONTRASTS_WITH and RELATED, direction is mostly cosmetic — traversal
 * helpers treat them as symmetric.
 *
 * Validation (acyclicity, dangling refs, dedupe) is enforced by buildGraph().
 */

import type { ConceptEdge } from '../src/core/graph/types';

export const SEED_EDGES: ConceptEdge[] = [
  // --- PREREQUISITE chain: foundations -> Present Perfect ---
  {
    from: 'grammar.past_simple',
    to: 'grammar.past_participle',
    kind: 'PREREQUISITE',
    weight: 1,
  },
  {
    from: 'grammar.past_participle',
    to: 'grammar.present_perfect_basic',
    kind: 'PREREQUISITE',
    weight: 1,
  },

  // --- PREREQUISITE: Present Simple feeds many things ---
  {
    from: 'grammar.present_simple',
    to: 'grammar.question_formation',
    kind: 'PREREQUISITE',
    weight: 0.8,
  },
  {
    from: 'grammar.present_simple',
    to: 'grammar.present_continuous',
    kind: 'PREREQUISITE',
    weight: 0.7,
  },
  {
    from: 'grammar.present_simple',
    to: 'grammar.conditional_0_1',
    kind: 'PREREQUISITE',
    weight: 0.9,
  },
  {
    from: 'grammar.plurals',
    to: 'grammar.articles_basic',
    kind: 'PREREQUISITE',
    weight: 0.7,
  },

  // --- CONTRASTS_WITH: classic learner confusions ---
  {
    from: 'grammar.present_simple',
    to: 'grammar.present_continuous',
    kind: 'CONTRASTS_WITH',
    weight: 1,
  },
  {
    from: 'grammar.past_simple',
    to: 'grammar.present_perfect_basic',
    kind: 'CONTRASTS_WITH',
    weight: 1,
  },

  // --- RELATED: same domain ---
  {
    from: 'grammar.comparatives',
    to: 'grammar.articles_basic',
    kind: 'RELATED',
    weight: 0.5,
  },

  // --- PART_OF: vocab clusters under broader umbrellas (illustrative) ---
  // (None at this scale; we'll add when vocab clusters get sub-clusters.)

  // --- Vocab.phrasal_verbs depends on basic vocab familiarity ---
  {
    from: 'vocab.daily_life',
    to: 'vocab.phrasal_verbs_basic',
    kind: 'PREREQUISITE',
    weight: 0.6,
  },
];
