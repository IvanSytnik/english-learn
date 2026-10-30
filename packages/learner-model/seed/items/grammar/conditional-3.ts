import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const CONDITIONAL_3 = grammarItems('grammar.conditional_3', [
  {
    slug: 'would_have_v3',
    level: 'B2',
    pattern: 'If + had + V3, would have + V3',
    example: 'If you had told me, I would have helped.',
    explanation: {
      en: 'Third conditional: an imagined past that did not happen, and its result.',
      ru: 'Третий тип: воображаемое прошлое, которого не было, и его результат.',
    },
    // No "would help": a mixed conditional (present result) is also right.
    practice: choice(
      'If you had asked me, I ___ you.',
      ['helped', 'would have helped', 'will have helped', 'had helped'],
      1,
    ),
  },
  {
    slug: 'past_perfect_in_if',
    level: 'B2',
    pattern: 'if-clause: had + V3',
    example: 'If I had known, I would have come.',
    explanation: {
      en: 'The if-clause takes the past perfect.',
      ru: 'В придаточном с if — Past Perfect.',
    },
    practice: cloze('If I ___ about the party, I would have come. (know)', 'had known', "'d known"),
  },
  {
    slug: 'might_could_have',
    level: 'B2',
    pattern: 'might / could have + V3 in the result',
    example: 'If we had left earlier, we might have caught the train.',
    explanation: {
      en: 'Might/could have + past participle: a possible past result.',
      ru: 'Might/could have + третья форма: возможный результат в прошлом.',
    },
    // No "might win": a mixed conditional is also right.
    practice: choice(
      "We ___ the match if our best player hadn't been injured.",
      ['might have won', 'will win', 'had won', 'won'],
      0,
    ),
  },
  {
    slug: 'contracted_d_had',
    level: 'B2',
    pattern: "'d = had (if-clause) · 'd = would (result)",
    example: "If I'd known, I'd have called.",
    explanation: {
      en: "In the if-clause 'd is had, so the past participle follows.",
      ru: "В придаточном 'd = had, поэтому дальше — третья форма.",
    },
    practice: choice(
      "If you'd ___ me, I'd have lent you the money.",
      ['ask', 'asking', 'have asked', 'asked'],
      3,
    ),
  },
]);
