import { choice } from '../practice';
import { grammarItems } from './gp';

export const CONDITIONAL_0_1 = grammarItems('grammar.conditional_0_1', [
  {
    slug: 'zero_general_truths',
    level: 'B1',
    pattern: 'If + Present Simple, Present Simple',
    example: 'If you heat water to 100°C, it boils.',
    explanation: {
      en: 'Zero conditional: general truths and rules.',
      ru: 'Нулевой кондиционал: общие истины и правила.',
    },
    practice: choice(
      'If you heat water to 100°C, it ___.',
      ['boil', 'boils', 'boiled', 'will boiling'],
      1,
    ),
  },
  {
    slug: 'first_real_future',
    level: 'B1',
    pattern: 'If + Present Simple, will + V1',
    example: 'If it rains, we will stay home.',
    explanation: {
      en: 'First conditional: real future possibility.',
      ru: 'Первый кондиционал: реальная возможность в будущем.',
    },
    practice: choice(
      'If it rains tomorrow, we ___ at home.',
      ['would stay', 'stayed', 'will staying', 'will stay'],
      3,
    ),
  },
  {
    slug: 'no_will_in_if_clause',
    level: 'B1',
    pattern: 'if-clause takes Present, not will',
    example: 'If it rains... (not: If it will rain...)',
    contrast: 'If it will rain, we will stay home. (wrong)',
    explanation: {
      en: 'The if-clause uses Present Simple even though the meaning is future.',
      ru: 'Придаточное с if использует Present Simple, хотя значение — будущее.',
    },
    practice: choice(
      "If it ___ tomorrow, we'll cancel the picnic.",
      ['rains', 'will rain', 'rained', 'is rain'],
      0,
    ),
  },
  {
    slug: 'unless_negative_if',
    level: 'B1',
    pattern: 'unless = if ... not',
    example: "Unless you hurry, you'll miss the train.",
    explanation: {
      en: 'unless replaces a negative if-clause.',
      ru: 'unless заменяет отрицательное придаточное с if.',
    },
    practice: choice("You'll miss the train ___ you hurry.", ['if', 'unless', 'when'], 1),
  },
]);
