/**
 * Seed items: vocab concepts (4 per concept, 28 total).
 * Mix of kinds so all four ItemKind variants are exercised by real data:
 *   daily_life  → 2 VOCAB_WORD + 1 COLLOCATION + 1 IDIOM
 *   travel      → 2 VOCAB_WORD + 1 COLLOCATION + 1 IDIOM
 *   phrasal_verbs_basic → 4 COLLOCATION
 *   work_study  → 2 VOCAB_WORD + 2 COLLOCATION
 *   phrasal_verbs_b2, collocations_b2 → 4 COLLOCATION each
 *   idioms_everyday → 4 IDIOM
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
        translation: {
          en: 'a plan of what you will do and when; timetable',
          ru: 'расписание, график',
        },
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
        translation: { en: 'food and household items you buy in a shop', ru: 'продукты (покупки)' },
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
        translation: { en: 'the card that lets you get on a plane', ru: 'посадочный талон' },
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

  // ── vocab.work_study ─────────────────────────────────────────────────────────
  {
    id: 'item.vocab.work_study.apply_for',
    conceptId: 'vocab.work_study',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'apply for a job',
        exampleSentence: 'She has applied for a job at the library.',
      },
      localized: {
        translation: { en: 'formally ask to be given a job', ru: 'подать заявку на работу' },
        usageNote: {
          en: 'apply FOR a job or visa, apply TO a company.',
          ru: 'apply FOR — на должность или визу, apply TO — в компанию.',
        },
      },
    },
  },
  {
    id: 'item.vocab.work_study.deadline',
    conceptId: 'vocab.work_study',
    kind: 'VOCAB_WORD',
    cefrLevel: 'B1',
    content: {
      source: {
        headword: 'deadline',
        partOfSpeech: 'noun',
        exampleSentence: 'The deadline is Friday.',
      },
      localized: {
        translation: {
          en: 'the latest time by which something must be done',
          ru: 'крайний срок, дедлайн',
        },
      },
    },
  },
  {
    id: 'item.vocab.work_study.colleague',
    conceptId: 'vocab.work_study',
    kind: 'VOCAB_WORD',
    cefrLevel: 'B1',
    content: {
      source: {
        headword: 'colleague',
        partOfSpeech: 'noun',
        exampleSentence: "I'm meeting a colleague for lunch.",
      },
      localized: {
        translation: { en: 'a person you work with', ru: 'коллега' },
      },
    },
  },
  {
    id: 'item.vocab.work_study.take_an_exam',
    conceptId: 'vocab.work_study',
    kind: 'COLLOCATION',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'take an exam',
        exampleSentence: 'We take exams in June.',
      },
      localized: {
        translation: { en: 'do an exam', ru: 'сдавать экзамен (проходить его)' },
        usageNote: {
          en: 'take (or sit) an exam; pass = succeed; never "make an exam".',
          ru: 'take (или sit) an exam; pass — успешно сдать; «make an exam» — ошибка.',
        },
      },
    },
  },

  // ── vocab.phrasal_verbs_b2 ───────────────────────────────────────────────────
  {
    id: 'item.vocab.phrasal_verbs_b2.run_out_of',
    conceptId: 'vocab.phrasal_verbs_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'run out of',
        exampleSentence: "We've run out of milk.",
      },
      localized: {
        translation: {
          en: 'use all of something so that none is left',
          ru: 'закончиться (о запасах)',
        },
        usageNote: {
          en: 'run out OF something: We have run out of milk.',
          ru: 'run out OF + то, что закончилось: We have run out of milk.',
        },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_b2.come_up_with',
    conceptId: 'vocab.phrasal_verbs_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'come up with',
        exampleSentence: 'She came up with a plan.',
      },
      localized: {
        translation: { en: 'think of an idea or plan', ru: 'придумать (идею, план)' },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_b2.put_up_with',
    conceptId: 'vocab.phrasal_verbs_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'put up with',
        exampleSentence: "I can't put up with this noise.",
      },
      localized: {
        translation: {
          en: 'accept something unpleasant without complaining',
          ru: 'терпеть, мириться с',
        },
      },
    },
  },
  {
    id: 'item.vocab.phrasal_verbs_b2.turn_down',
    conceptId: 'vocab.phrasal_verbs_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'turn down',
        exampleSentence: 'He turned down the offer.',
      },
      localized: {
        translation: { en: 'refuse an offer or request', ru: 'отклонить, отказаться от' },
      },
    },
  },

  // ── vocab.collocations_b2 ────────────────────────────────────────────────────
  {
    id: 'item.vocab.collocations_b2.pay_attention',
    conceptId: 'vocab.collocations_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'pay attention (to)',
        exampleSentence: 'Pay attention to the road.',
      },
      localized: {
        translation: { en: 'listen or watch carefully', ru: 'обращать внимание' },
      },
    },
  },
  {
    id: 'item.vocab.collocations_b2.make_progress',
    conceptId: 'vocab.collocations_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'make progress',
        exampleSentence: "She's making good progress.",
      },
      localized: {
        translation: { en: 'get better at something', ru: 'делать успехи' },
      },
    },
  },
  {
    id: 'item.vocab.collocations_b2.keep_a_promise',
    conceptId: 'vocab.collocations_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'keep a promise',
        exampleSentence: 'He always keeps his promises.',
      },
      localized: {
        translation: { en: 'do what you promised', ru: 'сдержать обещание' },
        usageNote: {
          en: 'keep (not hold) a promise.',
          ru: 'keep, а не hold (калька с нем. «halten»).',
        },
      },
    },
  },
  {
    id: 'item.vocab.collocations_b2.take_responsibility',
    conceptId: 'vocab.collocations_b2',
    kind: 'COLLOCATION',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'take responsibility (for)',
        exampleSentence: 'She took responsibility for the project.',
      },
      localized: {
        translation: {
          en: 'accept that something is your duty or your fault',
          ru: 'брать на себя ответственность',
        },
      },
    },
  },

  // ── vocab.idioms_everyday ────────────────────────────────────────────────────
  {
    id: 'item.vocab.idioms_everyday.piece_of_cake',
    conceptId: 'vocab.idioms_everyday',
    kind: 'IDIOM',
    cefrLevel: 'B1',
    content: {
      source: {
        phrase: 'a piece of cake',
        exampleSentence: 'The exam was a piece of cake.',
      },
      localized: {
        meaning: { en: 'very easy', ru: 'проще простого' },
      },
    },
  },
  {
    id: 'item.vocab.idioms_everyday.under_the_weather',
    conceptId: 'vocab.idioms_everyday',
    kind: 'IDIOM',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'under the weather',
        exampleSentence: "I'm a bit under the weather.",
      },
      localized: {
        meaning: { en: 'slightly ill', ru: 'неважно себя чувствовать' },
      },
    },
  },
  {
    id: 'item.vocab.idioms_everyday.break_the_ice',
    conceptId: 'vocab.idioms_everyday',
    kind: 'IDIOM',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'break the ice',
        exampleSentence: 'A joke can break the ice.',
      },
      localized: {
        meaning: {
          en: 'make people relax at the start of a meeting or party',
          ru: 'разрядить обстановку, «растопить лёд»',
        },
      },
    },
  },
  {
    id: 'item.vocab.idioms_everyday.once_in_a_blue_moon',
    conceptId: 'vocab.idioms_everyday',
    kind: 'IDIOM',
    cefrLevel: 'B2',
    content: {
      source: {
        phrase: 'once in a blue moon',
        exampleSentence: 'He calls once in a blue moon.',
      },
      localized: {
        meaning: { en: 'very rarely', ru: 'раз в сто лет, очень редко' },
      },
    },
  },
];
