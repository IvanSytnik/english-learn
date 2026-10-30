import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const CONDITIONAL_2 = grammarItems('grammar.conditional_2', [
  {
    slug: 'if_past_would',
    level: 'B1',
    pattern: 'If + Past Simple, would + V1',
    example: 'If I had a car, I would drive to work.',
    explanation: {
      en: 'Second conditional: an unreal or unlikely situation now or in the future.',
      ru: 'Второй тип: нереальная или маловероятная ситуация сейчас или в будущем.',
    },
    practice: choice(
      "If they ___ closer to the city, they wouldn't need a car — but they live in the country.",
      ['live', 'lived', 'would live', 'have lived'],
      1,
    ),
  },
  {
    slug: 'would_in_main',
    level: 'B1',
    pattern: 'main clause: would / could + V1',
    example: 'If we lived nearer, we could visit more often.',
    explanation: {
      en: 'The result clause takes would (or could/might) + base form.',
      ru: 'В главной части — would (или could/might) + первая форма.',
    },
    practice: choice(
      'If I won the lottery, I ___ a house by the sea.',
      ['would buy', 'will buy', 'bought', 'have bought'],
      0,
    ),
  },
  {
    slug: 'were_all_persons',
    level: 'B1',
    pattern: 'If I / he / she / it were…',
    example: 'If I were you, I would apologise.',
    explanation: {
      en: 'In the second conditional, were is used for every person, as in "If I were you".',
      ru: 'Во втором типе were употребляется со всеми лицами: «If I were you».',
    },
    // No "was": "If I was you" is common in speech.
    practice: choice('If I ___ you, I would take the job.', ['am', 'be', 'will be', 'were'], 3),
  },
  {
    slug: 'no_would_in_if',
    level: 'B1',
    pattern: 'if-clause: Past Simple, never would',
    example: 'If it were cheaper, I would buy it.',
    contrast: 'If it would be cheaper, I would buy it. (wrong)',
    explanation: {
      en: 'The if-clause never takes would.',
      ru: 'В придаточном с if would не бывает.',
    },
    practice: cloze('If I ___ her number, I would call her. (know)', 'knew'),
  },
]);
