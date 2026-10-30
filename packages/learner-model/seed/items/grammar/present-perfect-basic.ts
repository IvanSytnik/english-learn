import { choice } from '../practice';
import { grammarItems } from './gp';

export const PRESENT_PERFECT_BASIC = grammarItems('grammar.present_perfect_basic', [
  {
    slug: 'form_have_v3',
    level: 'B1',
    pattern: 'have/has + V3',
    example: 'I have seen that film. She has finished.',
    explanation: {
      en: 'Form: have/has + past participle.',
      ru: 'Форма: have/has + причастие прошедшего времени.',
    },
    practice: choice(
      'Look — she ___ her homework, so she can go out now.',
      ['have finished', 'has finish', 'has finished', 'finished has'],
      2,
    ),
  },
  {
    slug: 'experience_ever_never',
    level: 'B1',
    pattern: 'experience: ever / never',
    example: "Have you ever been to Japan? I've never tried sushi.",
    explanation: {
      en: 'Life experience without a specific time — ever in questions, never in negatives.',
      ru: 'Жизненный опыт без указания времени — ever в вопросах, never в отрицаниях.',
    },
    practice: choice(
      '___ to Japan?',
      ['Did you ever been', 'Have you ever been', 'Have you ever went', 'Are you ever been'],
      1,
    ),
  },
  {
    slug: 'recent_just_already_yet',
    level: 'B1',
    pattern: 'just / already / yet',
    example: "I've just eaten. She's already left. Have you finished yet?",
    explanation: {
      en: 'just = very recently; already = sooner than expected; yet = in questions/negatives, at the end.',
      ru: 'just = только что; already = раньше ожидаемого; yet = в вопросах/отрицаниях, в конце.',
    },
    practice: choice('Have you finished your report ___?', ['just', 'ago', 'yet'], 2),
  },
  {
    slug: 'for_since_unfinished',
    level: 'B1',
    pattern: 'for + period / since + starting point',
    example: "I've lived here for five years / since 2021.",
    contrast: 'since five years (wrong)',
    explanation: {
      en: 'Unfinished states: for + duration, since + starting moment.',
      ru: 'Незавершённые состояния: for + длительность, since + точка отсчёта.',
    },
    practice: choice("I've lived here ___ five years.", ['since', 'for', 'from', 'during'], 1),
  },
]);
