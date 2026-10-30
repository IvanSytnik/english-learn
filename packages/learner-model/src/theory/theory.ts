import type { Locale } from '@englishlearn/db/schemas';
import { GRAMMAR_THEORY } from './catalog';

/**
 * Short rule reference per grammar concept (B3.2): shown in the dashboard's
 * ConceptSheet and as the intro card before the first question of a concept
 * the learner has not practised yet.
 *
 * Static content, not a DB column: it ships with the code and is read-only
 * for learners. Rule reference only — never an item's answer (examples never
 * repeat a practice prompt or a diagnostic stem; enforced by
 * src/__tests__/seed-theory.test.ts).
 */

/** All four languages, required: the learner reads the one of contentLocale(). */
export type TheoryText = { en: string; ru: string; uk: string; de: string };

export type TheoryExample = {
  /** The English sentence. */
  en: string;
  /** Substrings of `en` that carry the rule — emphasised in the UI. */
  focus: readonly string[];
  /** Native-language rendering; English learners read the sentence alone. */
  translation: Omit<TheoryText, 'en'>;
};

export type ConceptTheory = {
  /** Compact pattern, English in every locale (as in textbooks). */
  formula: string;
  /** 2–4 sentences: when to use it and the key trap. */
  summary: TheoryText;
  examples: readonly TheoryExample[];
};

/** What crosses to the client: one language, plain serialisable values. */
export type ConceptTheoryView = {
  formula: string;
  summary: string;
  /** Language of `summary` and every `translation` (for the `lang` attribute). */
  locale: Locale;
  examples: { en: string; focus: string[]; translation: string | null }[];
};

/** The theory of a concept in `locale`, or null if the concept has none. */
export function getConceptTheory(conceptId: string, locale: Locale): ConceptTheoryView | null {
  const theory: ConceptTheory | undefined = GRAMMAR_THEORY[conceptId];
  if (!theory) return null;
  return {
    formula: theory.formula,
    summary: theory.summary[locale],
    locale,
    examples: theory.examples.map((e) => ({
      en: e.en,
      focus: [...e.focus],
      translation: locale === 'en' ? null : e.translation[locale],
    })),
  };
}
