import { choice } from '../practice';
import { grammarItems } from './gp';

export const QUESTION_FORMATION = grammarItems('grammar.question_formation', [
  {
    slug: 'yes_no_do_does',
    level: 'A2',
    pattern: 'Do/Does + subject + V1?',
    example: 'Do you like coffee? Does she work here?',
    contrast: 'Does she works here? (wrong)',
    explanation: {
      en: 'Yes/no questions in Present Simple use do/does before the subject; the verb stays base.',
      ru: 'Общие вопросы в Present Simple используют do/does перед подлежащим; глагол в начальной форме.',
    },
    practice: choice('___ she work here?', ['Do', 'Is', 'Does'], 2),
  },
  {
    slug: 'wh_word_order',
    level: 'A2',
    pattern: 'Wh- + do/does/did + subject + V1?',
    example: 'Where do you live? What did he say?',
    explanation: {
      en: 'Wh-word first, then auxiliary, then subject, then base verb.',
      ru: 'Сначала вопросительное слово, затем вспомогательный глагол, подлежащее и основа глагола.',
    },
    practice: choice('Where ___?', ['you live', 'do you live', 'you do live', 'does you live'], 1),
  },
  {
    slug: 'be_inversion',
    level: 'A2',
    pattern: 'Am/Is/Are + subject ...?',
    example: 'Are you ready? Is she a doctor?',
    contrast: 'Do you be ready? (wrong)',
    explanation: {
      en: 'With be, invert subject and verb — no do-support.',
      ru: 'С глаголом be — инверсия подлежащего и глагола, без do.',
    },
    practice: choice('___ ready to go?', ['Do you be', 'Be you', 'Is you', 'Are you'], 3),
  },
  {
    slug: 'subject_questions_no_do',
    level: 'B1',
    pattern: 'Who/What + V (subject question)',
    example: 'Who called you? What happened?',
    contrast: 'Who did call you? (wrong in neutral speech)',
    explanation: {
      en: 'When the wh-word IS the subject, there is no do-support.',
      ru: 'Если вопросительное слово — подлежащее, do не используется.',
    },
    practice: choice(
      'Who ___ you last night?',
      ['did called', 'called', 'has called', 'does call'],
      1,
    ),
  },
]);
