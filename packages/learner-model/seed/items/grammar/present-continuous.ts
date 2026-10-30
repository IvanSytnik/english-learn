import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const PRESENT_CONTINUOUS = grammarItems('grammar.present_continuous', [
  {
    slug: 'form_be_ving',
    level: 'A2',
    pattern: 'am/is/are + V-ing',
    example: 'She is reading now.',
    explanation: {
      en: 'Form: be (am/is/are) + present participle.',
      ru: 'Форма: be (am/is/are) + причастие настоящего времени.',
    },
    practice: cloze('Look outside! It ___. (snow)', 'is snowing'),
  },
  {
    slug: 'now_vs_around_now',
    level: 'A2',
    pattern: 'actions now / temporary situations',
    example: "I'm staying with friends this week.",
    explanation: {
      en: 'Happening at or around the moment of speaking; temporary states.',
      ru: 'Действие в момент речи или около него; временные ситуации.',
    },
    practice: choice(
      'I ___ with friends this week while my flat is being painted.',
      ['am staying', 'stay', 'stays', 'staying'],
      0,
    ),
  },
  {
    slug: 'future_arrangements',
    level: 'B1',
    pattern: 'Present Continuous for arrangements',
    example: "We're meeting Anna on Friday.",
    explanation: {
      en: 'Fixed personal arrangements with a set time use Present Continuous.',
      ru: 'Личные договорённости с назначенным временем — Present Continuous.',
    },
    practice: choice(
      "We ___ Anna on Friday — it's in my calendar.",
      ['meeting', 'meets', 'are meeting', 'will meeting'],
      2,
    ),
  },
  {
    slug: 'stative_verbs_no_ing',
    level: 'B1',
    pattern: 'stative verbs avoid -ing',
    example: 'I know the answer. (not: I am knowing)',
    contrast: 'I am knowing the answer. (wrong)',
    explanation: {
      en: 'know, like, want, believe, need describe states, not actions — no continuous.',
      ru: 'know, like, want, believe, need описывают состояния — континуус не используется.',
    },
    practice: choice(
      'I ___ the answer to this question.',
      ['am knowing', 'knowing', 'am know', 'know'],
      3,
    ),
  },
]);
