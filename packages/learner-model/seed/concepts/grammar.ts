/**
 * Seed concepts: GRAMMAR (A2-B1).
 *
 * These are the source of truth for the initial Knowledge Graph. Each concept
 * is a learnable unit with its own BKT state per learner. IDs are stable
 * forever — renaming requires a ConceptAlias mapping (not yet implemented).
 *
 * Editing rules:
 *   - Never change an existing `id`. Add new concepts; deprecate via a future
 *     `isArchived` flag if needed.
 *   - `name` is for admin/UI; safe to change.
 *   - `cefrLevel` is the *introduction* level (where this concept is first
 *     taught). Items inside the concept may exceed that ceiling.
 */

import type { Concept } from "../../src/core/graph/types";

export const GRAMMAR_CONCEPTS: Concept[] = [
  {
    id: "grammar.articles_basic",
    name: "Articles: a / an / the (basic)",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Indefinite vs definite article: first mention vs known reference; no article with most uncountables/plurals in general meaning.",
  },
  {
    id: "grammar.plurals",
    name: "Noun plurals (regular & common irregular)",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Regular -s/-es; common irregulars (children, men, women, feet); uncountables vs countables.",
  },
  {
    id: "grammar.comparatives",
    name: "Comparatives & superlatives",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "-er/-est, more/most, irregular forms (good/better/best). Comparative structures: than, as ... as.",
  },
  {
    id: "grammar.prepositions_time_place",
    name: "Prepositions of time and place (in/on/at)",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description: "in/on/at for time and place; common collocations.",
  },
  {
    id: "grammar.question_formation",
    name: "Question formation (yes/no & wh-)",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Subject-auxiliary inversion; wh- questions; question word order with do/does/did.",
  },
  {
    id: "grammar.present_simple",
    name: "Present Simple",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Habits, general truths, scheduled events. Third-person -s. Negatives and questions with do/does.",
  },
  {
    id: "grammar.present_continuous",
    name: "Present Continuous",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Actions happening now or around now; temporary situations; future arrangements.",
  },
  {
    id: "grammar.past_simple",
    name: "Past Simple",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Completed past actions. Regular -ed and common irregular verbs (V2). Negatives/questions with did.",
  },
  {
    id: "grammar.past_participle",
    name: "Past participle (V3) forms",
    cefrLevel: "B1",
    category: "GRAMMAR",
    description:
      "Regular -ed and irregular V3. Foundation for Present Perfect and passive voice.",
  },
  {
    id: "grammar.present_perfect_basic",
    name: "Present Perfect (basic uses)",
    cefrLevel: "B1",
    category: "GRAMMAR",
    description:
      "Have/has + past participle. Experience (ever/never), recent past (just), unfinished states (for/since).",
  },
  {
    id: "grammar.modal_verbs_basic",
    name: "Modal verbs: can / could / should / must (basic)",
    cefrLevel: "A2",
    category: "GRAMMAR",
    description:
      "Ability (can/could), advice (should), obligation/strong opinion (must). Bare infinitive after modals.",
  },
  {
    id: "grammar.conditional_0_1",
    name: "Conditionals: zero & first",
    cefrLevel: "B1",
    category: "GRAMMAR",
    description:
      "Zero: general truths (if + Present Simple, ... Present Simple). First: real future possibility (if + Present Simple, ... will).",
  },
];
