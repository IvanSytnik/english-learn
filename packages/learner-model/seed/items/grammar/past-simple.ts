import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const PAST_SIMPLE = grammarItems('grammar.past_simple', [
  {
    slug: 'regular_ed',
    level: 'A2',
    pattern: 'V1 + -ed (regular)',
    example: 'worked, played, studied, stopped',
    explanation: {
      en: '-ed spelling: y→ied after consonant; final consonant doubles after short stressed vowel.',
      ru: 'Правописание -ed: y→ied после согласной; удвоение конечной согласной после краткой ударной гласной.',
    },
    practice: cloze('Yesterday we ___ football in the park. (play)', 'played'),
  },
  {
    slug: 'irregular_v2',
    level: 'A2',
    pattern: 'irregular V2 forms',
    example: 'go → went, see → saw, buy → bought',
    explanation: {
      en: 'High-frequency irregular past forms must be memorized.',
      ru: 'Частотные неправильные формы прошедшего времени нужно запоминать.',
    },
    practice: choice('Last summer we ___ to Spain.', ['goed', 'gone', 'go', 'went'], 3),
  },
  {
    slug: 'negative_didnt',
    level: 'A2',
    pattern: "didn't + V1",
    example: "I didn't see him yesterday.",
    contrast: "I didn't saw him. (wrong)",
    explanation: {
      en: "Negatives use didn't + base verb — the past marking moves to did.",
      ru: "Отрицание: didn't + начальная форма — показатель прошедшего переходит в did.",
    },
    practice: choice("I didn't ___ him yesterday.", ['see', 'saw', 'seen', 'seeing'], 0),
  },
  {
    slug: 'questions_did',
    level: 'A2',
    pattern: 'Did + subject + V1?',
    example: 'Did you finish the report?',
    contrast: 'Did you finished? (wrong)',
    explanation: {
      en: 'Questions use did + base verb.',
      ru: 'Вопросы: did + начальная форма глагола.',
    },
    practice: choice(
      '___ the report on time?',
      ['Did you finished', 'You did finish', 'Did you finish', 'Do you finished'],
      2,
    ),
  },
]);
