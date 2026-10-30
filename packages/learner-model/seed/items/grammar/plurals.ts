import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const PLURALS = grammarItems('grammar.plurals', [
  {
    slug: 'regular_s_es',
    level: 'A2',
    pattern: 'noun + -s / -es',
    example: 'cat → cats, box → boxes, city → cities',
    explanation: {
      en: '-es after -s/-sh/-ch/-x; consonant + y → -ies.',
      ru: '-es после -s/-sh/-ch/-x; согласная + y → -ies.',
    },
    practice: cloze('There are three ___ on the shelf. (box)', 'boxes'),
  },
  {
    slug: 'irregular_common',
    level: 'A2',
    pattern: 'irregular plurals',
    example: 'child → children, man → men, foot → feet',
    explanation: {
      en: 'High-frequency irregular plurals must be memorized as forms.',
      ru: 'Частотные неправильные формы множественного числа нужно запоминать.',
    },
    practice: choice(
      'Two ___ are playing in the garden.',
      ['childs', 'childrens', 'children', 'child'],
      2,
    ),
  },
  {
    slug: 'uncountable_no_plural',
    level: 'A2',
    pattern: 'uncountable = no plural, no a/an',
    example: 'some information, some advice',
    contrast: 'informations, an advice (wrong)',
    explanation: {
      en: 'Uncountables (information, advice, money) take no plural and no a/an.',
      ru: 'Неисчисляемые (information, advice, money) не имеют множественного числа и не сочетаются с a/an.',
    },
    practice: choice(
      'Can you give me some ___ about my CV?',
      ['advices', 'advice', 'an advice'],
      1,
    ),
  },
  {
    slug: 'same_form_plurals',
    level: 'B1',
    pattern: 'zero-change plurals',
    example: 'one sheep → two sheep, one fish → two fish',
    explanation: {
      en: 'Some nouns keep the same form in singular and plural.',
      ru: 'Некоторые существительные не меняют форму во множественном числе.',
    },
    practice: choice('The farmer has twenty ___.', ['sheeps', 'sheepes', 'sheep'], 2),
  },
]);
