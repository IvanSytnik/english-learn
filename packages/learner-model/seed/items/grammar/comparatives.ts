import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const COMPARATIVES = grammarItems('grammar.comparatives', [
  {
    slug: 'er_est_short',
    level: 'A2',
    pattern: 'short adj + -er / -est',
    example: 'tall → taller → the tallest; big → bigger → the biggest',
    explanation: {
      en: 'One-syllable adjectives take -er/-est; final consonant doubles after a short vowel.',
      ru: 'Односложные прилагательные получают -er/-est; конечная согласная удваивается после краткой гласной.',
    },
    practice: cloze('My brother is ___ than me. (tall)', 'taller'),
  },
  {
    slug: 'more_most_long',
    level: 'A2',
    pattern: 'more / the most + long adjective',
    example: 'expensive → more expensive → the most expensive',
    contrast: 'expensiver (wrong)',
    explanation: {
      en: 'Adjectives of 2+ syllables (mostly) use more/most instead of -er/-est.',
      ru: 'Прилагательные из 2+ слогов (в основном) используют more/most вместо -er/-est.',
    },
    practice: choice(
      'This hotel is ___ than the one we stayed in last year.',
      ['expensiver', 'most expensive', 'more expensive', 'the more expensive'],
      2,
    ),
  },
  {
    slug: 'irregular_good_bad',
    level: 'A2',
    pattern: 'irregular: good/bad/far',
    example: 'good → better → the best; bad → worse → the worst',
    explanation: {
      en: 'good, bad, far have suppletive comparative forms.',
      ru: 'good, bad, far имеют супплетивные формы сравнения.',
    },
    practice: choice(
      "Today's weather is ___ than yesterday's. It's raining again.",
      ['worse', 'badder', 'more bad', 'worst'],
      0,
    ),
  },
  {
    slug: 'than_and_as_as',
    level: 'A2',
    pattern: 'comparative + than; as + adj + as',
    example: 'She is taller than me. He is as tall as his father.',
    explanation: {
      en: 'than after comparatives; as...as for equality.',
      ru: 'than после сравнительной степени; as...as для равенства.',
    },
    practice: choice('He is as tall ___ his father.', ['than', 'like', 'as', 'that'], 2),
  },
]);
