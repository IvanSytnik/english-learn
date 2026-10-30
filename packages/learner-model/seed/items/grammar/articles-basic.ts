import { choice } from '../practice';
import { grammarItems } from './gp';

export const ARTICLES_BASIC = grammarItems('grammar.articles_basic', [
  {
    slug: 'a_an_first_mention',
    level: 'A2',
    pattern: 'a/an + singular countable (first mention)',
    example: 'I saw a dog in the park.',
    explanation: {
      en: 'Use a/an when mentioning a singular countable noun for the first time.',
      ru: 'Используйте a/an при первом упоминании исчисляемого существительного в единственном числе.',
    },
    practice: choice(
      'Guess what? I saw ___ funny dog in the park this morning.',
      ['the', 'a', 'an', '—'],
      1,
    ),
  },
  {
    slug: 'the_known_reference',
    level: 'A2',
    pattern: 'the + known/unique reference',
    example: 'The dog was very friendly.',
    explanation: {
      en: 'Use the when both speaker and listener know which thing is meant.',
      ru: 'Используйте the, когда и говорящий, и слушающий знают, о чём речь.',
    },
    practice: choice('I saw a dog in the park. ___ dog was very friendly.', ['A', 'An', 'The'], 2),
  },
  {
    slug: 'an_before_vowel_sound',
    level: 'A2',
    pattern: 'an + vowel SOUND',
    example: 'an hour, an umbrella — but a university',
    contrast: "a hour (wrong — 'hour' starts with a vowel sound)",
    explanation: {
      en: 'Choose an before a vowel sound, not a vowel letter.',
      ru: 'Выбирайте an перед гласным ЗВУКОМ, а не буквой.',
    },
    practice: choice('It takes ___ hour to get there by bus.', ['an', 'a'], 0),
  },
  {
    slug: 'zero_article_general',
    level: 'A2',
    pattern: '∅ article + plural/uncountable (general meaning)',
    example: 'Dogs are loyal. Water is essential.',
    explanation: {
      en: 'No article with plurals and uncountables in a general sense.',
      ru: 'Без артикля с множественным числом и неисчисляемыми в общем значении.',
    },
    practice: choice('In general, ___ dogs are loyal animals.', ['the', '—', 'a'], 1),
  },
]);
