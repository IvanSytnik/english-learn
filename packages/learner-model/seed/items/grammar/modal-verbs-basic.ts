import { choice } from '../practice';
import { grammarItems } from './gp';

export const MODAL_VERBS_BASIC = grammarItems('grammar.modal_verbs_basic', [
  {
    slug: 'can_ability',
    level: 'A2',
    pattern: "can/can't + V1 (ability)",
    example: "She can swim. I can't drive.",
    contrast: 'She can to swim / She cans swim (wrong)',
    explanation: {
      en: 'Present ability and possibility; bare infinitive follows.',
      ru: 'Способность и возможность в настоящем; далее — инфинитив без to.',
    },
    practice: choice('She ___ swim very well.', ['cans', 'can to', 'is can', 'can'], 3),
  },
  {
    slug: 'could_past_ability',
    level: 'A2',
    pattern: 'could + V1 (past ability / polite)',
    example: 'I could read at five. Could you help me?',
    explanation: {
      en: 'Past ability and polite requests.',
      ru: 'Способность в прошлом и вежливые просьбы.',
    },
    practice: choice(
      'When I was five, I ___ already read.',
      ['could', 'can', 'could to', 'cans'],
      0,
    ),
  },
  {
    slug: 'should_advice',
    level: 'A2',
    pattern: "should/shouldn't + V1 (advice)",
    example: 'You should see a doctor.',
    explanation: { en: 'Advice and recommendations.', ru: 'Советы и рекомендации.' },
    practice: choice(
      'You look ill. You ___ see a doctor.',
      ['should to', 'should', 'shoulds', 'must to'],
      1,
    ),
  },
  {
    slug: 'must_obligation',
    level: 'A2',
    pattern: "must/mustn't + V1 (obligation/prohibition)",
    example: "You must wear a seatbelt. You mustn't smoke here.",
    explanation: {
      en: "Strong obligation; mustn't = prohibition, not absence of necessity.",
      ru: "Сильное обязательство; mustn't = запрет, а не отсутствие необходимости.",
    },
    usageNote: {
      en: "Don't confuse mustn't (prohibited) with don't have to (not necessary).",
      ru: "Не путайте mustn't (запрещено) с don't have to (не обязательно).",
    },
    practice: choice(
      "You ___ smoke here. It's against the rules.",
      ["don't must", 'must', "mustn't", "needn't"],
      2,
    ),
  },
]);
