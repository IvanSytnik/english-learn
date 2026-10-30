import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const PRESENT_SIMPLE = grammarItems('grammar.present_simple', [
  {
    slug: 'third_person_s',
    level: 'A2',
    pattern: 'he/she/it + V-s',
    example: 'She works in a bank.',
    contrast: 'She work in a bank. (wrong)',
    explanation: {
      en: 'Third-person singular adds -s in affirmative Present Simple.',
      ru: 'Третье лицо единственного числа получает -s в утвердительной форме Present Simple.',
    },
    practice: cloze('She ___ in a bank. (work)', 'works'),
  },
  {
    slug: 'negative_dont_doesnt',
    level: 'A2',
    pattern: "don't/doesn't + V1",
    example: "He doesn't smoke. They don't live here.",
    contrast: "He doesn't smokes. (wrong)",
    explanation: {
      en: "Negatives use don't/doesn't + base verb — the -s moves to does.",
      ru: "Отрицание: don't/doesn't + начальная форма — окончание -s переходит в does.",
    },
    practice: choice('He ___ smoke.', ["don't", 'not', "doesn't", "isn't"], 2),
  },
  {
    slug: 'habits_adverbs',
    level: 'A2',
    pattern: 'Present Simple + frequency adverbs',
    example: 'I usually get up at 7. She never eats meat.',
    explanation: {
      en: 'Habits and routines; frequency adverbs go before the main verb.',
      ru: 'Привычки и распорядок; наречия частотности стоят перед смысловым глаголом.',
    },
    practice: choice(
      'I ___ at 7 every morning.',
      ['get usually up', 'usually get up', 'usually getting up', 'am usually get up'],
      1,
    ),
  },
  {
    slug: 'schedules_future',
    level: 'B1',
    pattern: 'Present Simple for timetables',
    example: 'The train leaves at 9:15 tomorrow.',
    explanation: {
      en: 'Fixed schedules (transport, programmes) use Present Simple even for future.',
      ru: 'Расписания (транспорт, программы) используют Present Simple даже для будущего.',
    },
    practice: choice(
      'Hurry up! According to the timetable, the train ___ at 9:15.',
      ['leave', 'leaving', 'is leave', 'leaves'],
      3,
    ),
  },
]);
