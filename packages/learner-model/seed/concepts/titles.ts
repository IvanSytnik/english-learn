/**
 * Learner-facing concept titles (Concept.title), keyed by concept id.
 *
 * Separate from the concept definitions on purpose: `name` there is the
 * English admin label; these are what a learner reads in the reason chip,
 * ConceptSheet, reveal and session summary. Tense names stay in English in
 * every locale (that is how learners meet them in textbooks), with a native
 * gloss in parentheses.
 *
 * Every seed concept must have an entry with all four locales — enforced by
 * src/__tests__/seed-titles.test.ts.
 */

import type { LocalizedString } from '@englishlearn/db/schemas';

export const CONCEPT_TITLES: Readonly<Record<string, LocalizedString>> = {
  'grammar.articles_basic': {
    en: 'Articles: a, an, the',
    ru: 'Артикли: a, an, the',
    uk: 'Артиклі: a, an, the',
    de: 'Artikel: a, an, the',
  },
  'grammar.plurals': {
    en: 'Plural nouns',
    ru: 'Множественное число существительных',
    uk: 'Множина іменників',
    de: 'Nomen im Plural',
  },
  'grammar.comparatives': {
    en: 'Comparatives and superlatives',
    ru: 'Сравнительная и превосходная степени',
    uk: 'Вищий і найвищий ступені порівняння',
    de: 'Komparativ und Superlativ',
  },
  'grammar.prepositions_time_place': {
    en: 'Prepositions of time and place: in, on, at',
    ru: 'Предлоги времени и места: in, on, at',
    uk: 'Прийменники часу й місця: in, on, at',
    de: 'Präpositionen der Zeit und des Ortes: in, on, at',
  },
  'grammar.question_formation': {
    en: 'Asking questions',
    ru: 'Как задавать вопросы',
    uk: 'Як ставити запитання',
    de: 'Fragen bilden',
  },
  'grammar.present_simple': {
    en: 'Present Simple',
    ru: 'Present Simple (настоящее простое время)',
    uk: 'Present Simple (теперішній простий час)',
    de: 'Present Simple (einfache Gegenwart)',
  },
  'grammar.present_continuous': {
    en: 'Present Continuous',
    ru: 'Present Continuous (настоящее длительное время)',
    uk: 'Present Continuous (теперішній тривалий час)',
    de: 'Present Continuous (Verlaufsform der Gegenwart)',
  },
  'grammar.past_simple': {
    en: 'Past Simple',
    ru: 'Past Simple (простое прошедшее время)',
    uk: 'Past Simple (минулий простий час)',
    de: 'Past Simple (einfache Vergangenheit)',
  },
  'grammar.past_participle': {
    en: 'Past participle (third form)',
    ru: 'Причастие прошедшего времени (третья форма)',
    uk: 'Дієприкметник минулого часу (третя форма)',
    de: 'Partizip II (dritte Verbform)',
  },
  'grammar.present_perfect_basic': {
    en: 'Present Perfect: the basics',
    ru: 'Present Perfect: основы',
    uk: 'Present Perfect: основи',
    de: 'Present Perfect: Grundlagen',
  },
  'grammar.modal_verbs_basic': {
    en: 'Modal verbs: can, could, should, must',
    ru: 'Модальные глаголы: can, could, should, must',
    uk: 'Модальні дієслова: can, could, should, must',
    de: 'Modalverben: can, could, should, must',
  },
  'grammar.conditional_0_1': {
    en: 'Zero and first conditionals',
    ru: 'Условные предложения нулевого и первого типа',
    uk: 'Умовні речення нульового й першого типу',
    de: 'Bedingungssätze Typ 0 und Typ 1',
  },
  'grammar.conditional_2': {
    en: 'Second conditional',
    ru: 'Условные предложения второго типа',
    uk: 'Умовні речення другого типу',
    de: 'Bedingungssätze Typ 2',
  },
  'grammar.passive_voice': {
    en: 'Passive voice',
    ru: 'Пассивный залог',
    uk: 'Пасивний стан',
    de: 'Passiv',
  },
  'grammar.conditional_3': {
    en: 'Third conditional',
    ru: 'Условные предложения третьего типа',
    uk: 'Умовні речення третього типу',
    de: 'Bedingungssätze Typ 3',
  },
  'grammar.modals_deduction': {
    en: "Modals of deduction: must, might, can't",
    ru: "Модальные глаголы предположения: must, might, can't",
    uk: "Модальні дієслова припущення: must, might, can't",
    de: "Modalverben der Vermutung: must, might, can't",
  },
  'vocab.daily_life': {
    en: 'Everyday life',
    ru: 'Повседневная жизнь',
    uk: 'Повсякденне життя',
    de: 'Alltag',
  },
  'vocab.travel': {
    en: 'Travel',
    ru: 'Путешествия',
    uk: 'Подорожі',
    de: 'Reisen',
  },
  'vocab.phrasal_verbs_basic': {
    en: 'Common phrasal verbs',
    ru: 'Базовые фразовые глаголы',
    uk: 'Базові фразові дієслова',
    de: 'Gängige Phrasal Verbs',
  },
  'vocab.work_study': {
    en: 'Work and study',
    ru: 'Работа и учёба',
    uk: 'Робота й навчання',
    de: 'Arbeit und Studium',
  },
  'vocab.phrasal_verbs_b2': {
    en: 'Phrasal verbs (B2)',
    ru: 'Фразовые глаголы (B2)',
    uk: 'Фразові дієслова (B2)',
    de: 'Phrasal Verbs (B2)',
  },
  'vocab.collocations_b2': {
    en: 'Collocations: make, take, pay, keep',
    ru: 'Устойчивые сочетания: make, take, pay, keep',
    uk: 'Сталі сполучення: make, take, pay, keep',
    de: 'Kollokationen: make, take, pay, keep',
  },
  'vocab.idioms_everyday': {
    en: 'Everyday idioms',
    ru: 'Распространённые идиомы',
    uk: 'Поширені ідіоми',
    de: 'Gängige Redewendungen',
  },
};
