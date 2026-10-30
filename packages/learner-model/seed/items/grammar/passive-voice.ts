import { choice, cloze } from '../practice';
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
      uk: 'Пасив у Present Simple: is/are + V3, коли важлива дія, а не виконавець.',
      de: 'Passiv im Present Simple: is/are + V3, wenn die Handlung wichtiger ist als die handelnde Person.',
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
      uk: 'Пасив у Past Simple: was/were + V3.',
      de: 'Passiv im Past Simple: was/were + V3.',
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
      uk: 'By вводить того, хто виконав дію.',
      de: 'By nennt, wer die Handlung ausgeführt hat.',
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
      uk: 'Після модального дієслова пасив — be + V3.',
      de: 'Nach einem Modalverb ist das Passiv be + V3.',
    },
    practice: choice(
      'Mobile phones must ___ off during the exam.',
      ['turned', 'be turned', 'being turned', 'be turning'],
      1,
    ),
  },
  {
    slug: 'present_perfect_passive',
    level: 'B1',
    pattern: 'has / have + been + V3',
    example: 'The road has been repaired.',
    explanation: {
      en: 'Present Perfect passive: have/has + been + V3, for a recent result.',
      ru: 'Пассив в Present Perfect: have/has + been + V3 — недавний результат.',
      uk: 'Пасив у Present Perfect: have/has + been + V3 — нещодавній результат.',
      de: 'Present Perfect Passiv: have/has + been + V3 für ein frisches Ergebnis.',
    },
    practice: choice(
      'The road ___, so you can drive on it again.',
      ['has repaired', 'is repairing', 'has been repaired', 'repaired'],
      2,
    ),
  },
  {
    slug: 'passive_negative',
    level: 'B1',
    pattern: "isn't / aren't / wasn't + V3",
    example: "The rooms aren't cleaned every day.",
    explanation: {
      en: "In a negative passive, not comes after be: aren't cleaned, wasn't invited.",
      ru: "В отрицательном пассиве not стоит после be: aren't cleaned, wasn't invited.",
      uk: "У заперечному пасиві not стоїть після be: aren't cleaned, wasn't invited.",
      de: "Im verneinten Passiv steht not nach be: aren't cleaned, wasn't invited.",
    },
    practice: choice(
      "The rooms ___ every day — that's why they're so dirty.",
      ["don't clean", "aren't cleaned", "isn't cleaned", 'not cleaned'],
      1,
    ),
  },
  {
    slug: 'passive_question',
    level: 'B1',
    pattern: 'Wh- + was / were + subject + V3?',
    example: 'When was this bridge built?',
    explanation: {
      en: 'In a passive question, be comes before the subject: When was it built?',
      ru: 'В пассивном вопросе be стоит перед подлежащим: When was it built?',
      uk: 'У пасивному питанні be стоїть перед підметом: When was it built?',
      de: 'In einer Passivfrage steht be vor dem Subjekt: When was it built?',
    },
    practice: choice(
      'This bridge looks very old. When ___?',
      [
        'did this bridge build',
        'was built this bridge',
        'this bridge was built',
        'was this bridge built',
      ],
      3,
    ),
  },
  {
    slug: 'are_plural_subject',
    level: 'B1',
    pattern: 'plural subject + are + V3',
    example: 'Millions of emails are sent every day.',
    explanation: {
      en: 'In the passive, be agrees with the subject: is for one thing, are for more than one.',
      ru: 'В пассиве be согласуется с подлежащим: is — для одного предмета, are — для нескольких.',
      uk: 'У пасиві be узгоджується з підметом: is — для одного предмета, are — для кількох.',
      de: 'Im Passiv richtet sich be nach dem Subjekt: is für eine Sache, are für mehrere.',
    },
    practice: cloze(
      'Nowadays millions of emails ___ every day. (send)',
      'are sent',
      'are being sent',
    ),
  },
  {
    slug: 'present_continuous_passive',
    level: 'B1',
    pattern: 'am / is / are + being + V3',
    example: 'The lift is being repaired at the moment.',
    explanation: {
      en: 'Present Continuous passive: is/are + being + V3, for something happening now.',
      ru: 'Пассив в Present Continuous: is/are + being + V3 — действие происходит сейчас.',
      uk: 'Пасив у Present Continuous: is/are + being + V3 — дія відбувається зараз.',
      de: 'Present Continuous Passiv: is/are + being + V3 für etwas, das gerade passiert.',
    },
    practice: choice(
      'Sorry, you have to take the stairs — the lift ___ at the moment.',
      ['is being repaired', 'is repairing', 'is repaired', 'repairs'],
      0,
    ),
  },
  {
    slug: 'future_will_be_v3',
    level: 'B1',
    pattern: 'will be + V3',
    example: 'The results will be announced next week.',
    explanation: {
      en: 'The future passive is will be + V3.',
      ru: 'Пассив в будущем времени: will be + V3.',
      uk: 'Пасив у майбутньому часі: will be + V3.',
      de: 'Das Passiv im Futur ist will be + V3.',
    },
    practice: choice(
      'The exam results ___ next week.',
      ['will announce', 'are announcing', 'will announced', 'will be announced'],
      3,
    ),
  },
]);
