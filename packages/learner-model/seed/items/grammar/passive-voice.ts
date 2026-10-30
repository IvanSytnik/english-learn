import { choice } from '../practice';
import { grammarItems } from './gp';

export const PASSIVE_VOICE = grammarItems('grammar.passive_voice', [
  {
    slug: 'present_simple_passive',
    level: 'B1',
    pattern: 'am / is / are + V3',
    example: 'English is spoken all over the world.',
    explanation: {
      en: 'Present Simple passive: is/are + past participle when the action matters more than who does it.',
      ru: 'Пассив в Present Simple: is/are + третья форма, когда важно действие, а не исполнитель.',
    },
    practice: choice('These cars ___ in Germany.', ['are made', 'make', 'made', 'are making'], 0),
  },
  {
    slug: 'past_simple_passive',
    level: 'B1',
    pattern: 'was / were + V3',
    example: 'The letters were sent yesterday.',
    explanation: {
      en: 'Past Simple passive: was/were + past participle.',
      ru: 'Пассив в Past Simple: was/were + третья форма.',
    },
    practice: choice(
      'My bike ___ last night, so I walked to work.',
      ['stole', 'has stolen', 'was stolen', 'was stealing'],
      2,
    ),
  },
  {
    slug: 'by_agent',
    level: 'B1',
    pattern: 'passive + by + who did it',
    example: 'The film was directed by a young woman.',
    explanation: {
      en: 'By introduces who did the action.',
      ru: 'By вводит того, кто совершил действие.',
    },
    practice: choice(
      'This song was written ___ my favourite singer.',
      ['from', 'of', 'with', 'by'],
      3,
    ),
  },
  {
    slug: 'modal_passive',
    level: 'B1',
    pattern: 'must / can / should + be + V3',
    example: 'The form must be signed in ink.',
    explanation: {
      en: 'After a modal, the passive is be + past participle.',
      ru: 'После модального глагола пассив — be + третья форма.',
    },
    practice: choice(
      'Mobile phones must ___ off during the exam.',
      ['turned', 'be turned', 'being turned', 'be turning'],
      1,
    ),
  },
]);
