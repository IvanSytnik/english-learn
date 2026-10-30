import { choice } from '../practice';
import { grammarItems } from './gp';

export const MODALS_DEDUCTION = grammarItems('grammar.modals_deduction', [
  {
    slug: 'must_sure',
    level: 'B2',
    pattern: "must + V1 = I'm sure it's true",
    example: 'She must be tired after that flight.',
    explanation: {
      en: 'Must: you are almost sure something is true.',
      ru: 'Must: вы почти уверены, что это так.',
    },
    practice: choice(
      "You've been walking all day — you ___ be exhausted.",
      ['must', "can't", "mustn't", "needn't"],
      0,
    ),
  },
  {
    slug: 'cant_impossible',
    level: 'B2',
    pattern: "can't + V1 = I'm sure it's not true",
    example: "He can't be at home — his car isn't here.",
    explanation: {
      en: "Can't: you are sure something is impossible.",
      ru: "Can't: вы уверены, что это невозможно.",
    },
    practice: choice(
      "That ___ be Tom at the door — he's on holiday in Spain.",
      ['must', "can't", 'should', 'will'],
      1,
    ),
  },
  {
    slug: 'might_perhaps',
    level: 'B2',
    pattern: 'might / could + V1 = perhaps',
    example: 'It might be true, but I doubt it.',
    explanation: {
      en: 'Might/could: something is possible, but you are not sure.',
      ru: 'Might/could: возможно, но вы не уверены.',
    },
    practice: choice(
      "Take an umbrella — it ___ rain later, but I'm not sure.",
      ['must', "can't", 'might', "mustn't"],
      2,
    ),
  },
  {
    slug: 'past_have_v3',
    level: 'B2',
    pattern: "must / might / can't + have + V3",
    example: 'She must have forgotten.',
    explanation: {
      en: 'For a deduction about the past, add have + past participle.',
      ru: 'Предположение о прошлом: + have + третья форма.',
    },
    practice: choice(
      'The ground is wet. It must ___ during the night.',
      ['rain', 'had rained', 'be raining', 'have rained'],
      3,
    ),
  },
]);
