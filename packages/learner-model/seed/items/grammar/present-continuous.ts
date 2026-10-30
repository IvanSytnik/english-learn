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
  {
    slug: 'ing_double_consonant',
    level: 'A2',
    pattern: 'short vowel + consonant → double it + -ing',
    example: 'swim → swimming, run → running, sit → sitting',
    explanation: {
      en: 'After a short stressed vowel, the final consonant doubles before -ing: swimming, running.',
      ru: 'После краткой ударной гласной конечная согласная удваивается перед -ing: swimming, running.',
      uk: 'Після короткого наголошеного голосного кінцевий приголосний подвоюється перед -ing: swimming, running.',
      de: 'Nach einem kurzen betonten Vokal wird der Endkonsonant vor -ing verdoppelt: swimming, running.',
    },
    practice: cloze('Look! The children ___ in the lake. (swim)', 'are swimming'),
  },
  {
    slug: 'ing_drop_e',
    level: 'A2',
    pattern: 'drop the final -e + -ing',
    example: 'make → making, write → writing, come → coming',
    explanation: {
      en: 'A silent final -e drops before -ing: making, writing.',
      ru: 'Немая конечная -e выпадает перед -ing: making, writing.',
      uk: 'Німа кінцева -e випадає перед -ing: making, writing.',
      de: 'Ein stummes End-e fällt vor -ing weg: making, writing.',
    },
    practice: cloze(
      'I ___ dinner right now — can I call you back? (make)',
      'am making',
      "'m making",
    ),
  },
  {
    slug: 'negative_isnt_ving',
    level: 'A2',
    pattern: "am not / isn't / aren't + V-ing",
    example: "It isn't raining now. They aren't listening.",
    contrast: "It doesn't raining. (wrong)",
    explanation: {
      en: 'The negative is be + not + V-ing; do/does is not used.',
      ru: 'Отрицание: be + not + V-ing; do/does не используется.',
      uk: 'Заперечення: be + not + V-ing; do/does не вживається.',
      de: 'Die Verneinung ist be + not + V-ing; do/does wird nicht verwendet.',
    },
    practice: choice(
      "Look, the sun's out! It ___ now.",
      ["isn't raining", "doesn't rain", 'not raining', "isn't rain"],
      0,
    ),
  },
  {
    slug: 'questions_be_ving',
    level: 'A2',
    pattern: 'Am / Is / Are + subject + V-ing?',
    example: 'Are you listening? What is she doing?',
    contrast: 'Do you listening? (wrong)',
    explanation: {
      en: 'Questions put am/is/are before the subject; the verb keeps -ing.',
      ru: 'В вопросе am/is/are ставится перед подлежащим, глагол сохраняет -ing.',
      uk: 'У питанні am/is/are ставиться перед підметом, дієслово зберігає -ing.',
      de: 'In Fragen steht am/is/are vor dem Subjekt, das Verb behält -ing.',
    },
    practice: choice(
      'Why ___ at me? Is there something on my face?',
      ['do you look', 'are you looking', 'you are looking', 'are you look'],
      1,
    ),
  },
  {
    slug: 'always_complaint',
    level: 'B1',
    pattern: 'always + V-ing (an annoying habit)',
    example: "He's always losing his keys!",
    explanation: {
      en: 'always + Present Continuous complains about a habit that annoys you.',
      ru: 'always + Present Continuous — жалоба на раздражающую привычку.',
      uk: 'always + Present Continuous — скарга на дратівливу звичку.',
      de: 'always + Present Continuous beschwert sich über eine nervige Gewohnheit.',
    },
    practice: cloze('My brother is always ___ his keys — it drives me crazy! (lose)', 'losing'),
  },
  {
    slug: 'be_agrees_with_subject',
    level: 'A2',
    pattern: 'plural subject + are + V-ing',
    example: 'My parents are cooking. The dog is sleeping.',
    contrast: 'My parents is cooking. (wrong)',
    explanation: {
      en: 'be agrees with the subject: am with I, is with one person or thing, are with plurals and you.',
      ru: 'be согласуется с подлежащим: am — с I, is — с одним лицом или предметом, are — с множественным числом и you.',
      uk: 'be узгоджується з підметом: am — з I, is — з однією особою чи предметом, are — з множиною та you.',
      de: 'be richtet sich nach dem Subjekt: am bei I, is bei einer Person oder Sache, are im Plural und bei you.',
    },
    practice: choice(
      'My parents ___ dinner in the kitchen right now.',
      ['is cooking', 'are cooking', 'cooking', 'are cook'],
      1,
    ),
  },
]);
