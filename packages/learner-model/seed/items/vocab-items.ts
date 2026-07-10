/**
 * Seed items: vocab concepts (4 per concept, 12 total).
 * Mix of kinds so all four ItemKind variants are exercised by real data:
 *   daily_life  → 2 VOCAB_WORD + 1 COLLOCATION + 1 IDIOM
 *   travel      → 2 VOCAB_WORD + 1 COLLOCATION + 1 IDIOM
 *   phrasal_verbs_basic → 4 COLLOCATION
 */

import type { SeedItem } from './types';

export const VOCAB_ITEMS: SeedItem[] = [
  // ── vocab.daily_life ──────────────────────────────────────────────────────
  {
    id: 'item.vocab.daily_life.schedule',
    conceptId: 'vocab.daily_life',
    kind: 'VOCAB_WORD',
    cefrLevel: 'A2',
    content: {
      source: {
        headword: 'schedule',
        partOfSpeech: 'noun',
        exampleSentence: 'My schedule is very busy this week.',
        ipa: '/ˈʃɛdjuːl/',
      },
      localized: {
        translation: { en: 'schedule; timetable', ru: 'расписание, график' },
        exampleTranslation: {
          en: 'My schedule is very busy this week.',
          ru: 'Моё расписание на этой неделе очень плотное.',
        },
      },
    },
  },
  {
    id: 'item.vocab.daily_life.groceries',
    conceptId: 'vocab.daily_life',
    kind: 'VOCAB_WORD',
    cefrLevel: 'A2',
    content: {
      source: {
        headword: 'groceries',
        partOfSpeech: 'noun',
        exampleSentence: 'I buy groceries every Saturday.',
      },
      localized: {
        translation: { en: 'food shopping; groceries', ru: 'продукты (покупки)' },
        exampleTranslation: {
          en: 'I buy groceries every Saturday.',
          ru: 'Я покупаю продукты каждую субботу.',
        },
      },
    },
  },
  {
    id: 'item.vocab.daily_life.do_the_dishes',
    conceptId: 'vocab.daily_life',
    kind: 'COLLOCATION',
    cefrLevel: 'A2',
    content: {
      source: {
        phrase: 'do the dishes',
        exampleSentence: 'Whose turn is it to do the dishes?',
      },
      localized: {
        translation: { en: 'wash the plates and cutlery', ru: 'мыть посуду' },
        usageNote: {
          en: 'do (not make) with housework: do the dishes/laundry/cleaning.',
          ru: 'С домашними делами — do (не make): do the dishes/laundry/cleaning.',
        },
      },
    },
  },
  {
    id: 'item.vocab.daily_life.early_bird',
    conceptId: 'vocab.daily_life',
    kind: 'IDIOM',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'early bird',
        exampleSentence: "She's an early bird — she's up at 5 every day.",
      },
      localized: {
        meaning: {
          en: 'a person who wakes up or arrives early',
          ru: 'ранняя пташка; тот, кто рано встаёт',
        },
        exampleTranslation: {
          en: "She's an early bird — she's up at 5 every day.",
          ru: 'Она ранняя пташка — встаёт в 5 каждый день.',
        },
      },
    },
  },

  // ── vocab.travel ──────────────────────────────────────────────────────────
  {
    id: 'item.vocab.travel.boarding_pass',
    conceptId: 'vocab.travel',
    kind: 'VOCAB_WORD',
    cefrLevel: 'B1',
    content: {
      source: {
        headword: 'boarding pass',
        partOfSpeech: 'noun',
        exampleSentence: 'Please have your boarding pass and passport ready.',
      },
      localized: {
        translation: { en: 'boarding pass', ru: 'посадочный талон' },
        exampleTranslation: {
          en: 'Please have your boarding pass and passport ready.',
          ru: 'Пожалуйста, приготовьте посадочный талон и паспорт.',
        },
      },
    },
  },
  {
    id: 'item.vocab.travel.luggage',
    conceptId: 'vocab.travel',
    kind: 'VOCAB_WORD',
    cefrLevel: 'B1',
    content: {
      source: {
        headword: 'luggage',
        partOfSpeech: 'noun',
        exampleSentence: 'How much luggage can I take on board?',
      },
      localized: {
        translation: { en: 'bags and suitcases (uncountable)', ru: 'багаж' },
        definition: {
          en: "Uncountable: a piece of luggage, not 'a luggage' or 'luggages'.",
          ru: "Неисчисляемое: a piece of luggage, а не 'a luggage' или 'luggages'.",
        },
      },
    },
  },
  {
    id: 'item.vocab.travel.check_in',
    conceptId: 'vocab.travel',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'check in',
        exampleSentence: 'We checked in online the night before the flight.',
      },
      localized: {
        translation: {
          en: 'register at a hotel/airport',
          ru: 'зарегистрироваться (в отеле/на рейс)',
        },
        usageNote: {
          en: 'Opposite at hotels: check out.',
          ru: 'Противоположное в отеле: check out (выписаться).',
        },
      },
    },
  },
  {
    id: 'item.vocab.travel.off_beaten_track',
    conceptId: 'vocab.travel',
    kind: 'IDIOM',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'off the beaten track',
        exampleSentence: 'We found a lovely village off the beaten track.',
      },
      localized: {
        meaning: {
          en: 'far from popular tourist routes',
          ru: 'вдали от туристических маршрутов; в глуши',
        },
      },
    },
  },

  // ── vocab.phrasal_verbs_basic ─────────────────────────────────────────────
  {
    id: 'item.vocab.phrasal_verbs_basic.get_up',
    conceptId: 'vocab.phrasal_verbs_basic',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'get up',
        exampleSentence: 'I usually get up at seven.',
      },
      localized: {
        translation: { en: 'rise from bed', ru: 'вставать (с постели)' },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_basic.turn_on_off',
    conceptId: 'vocab.phrasal_verbs_basic',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'turn on / turn off',
        exampleSentence: 'Could you turn off the lights?',
      },
      localized: {
        translation: {
          en: 'switch a device on/off',
          ru: 'включать / выключать',
        },
        usageNote: {
          en: 'Separable: turn it on (not: turn on it).',
          ru: 'Разделяемый: turn it on (не turn on it).',
        },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_basic.look_for',
    conceptId: 'vocab.phrasal_verbs_basic',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'look for',
        exampleSentence: "I'm looking for my keys.",
      },
      localized: {
        translation: { en: 'try to find', ru: 'искать' },
        usageNote: {
          en: 'Compare: look for (search) vs find out (discover information).',
          ru: 'Сравните: look for (искать) и find out (узнавать информацию).',
        },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_basic.give_up',
    conceptId: 'vocab.phrasal_verbs_basic',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'give up',
        exampleSentence: "Don't give up — you're almost there!",
      },
      localized: {
        translation: {
          en: 'stop trying; quit a habit',
          ru: 'сдаваться; бросать (привычку)',
        },
      },
    },
  },
];
