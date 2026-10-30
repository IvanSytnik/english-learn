import { choice, cloze } from '../practice';
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
  {
    slug: 'when_clause_present',
    level: 'B1',
    pattern: 'when / as soon as + Present Simple (future meaning)',
    example: "I'll call you when I get home.",
    contrast: "I'll call you when I will get home. (wrong)",
    explanation: {
      en: 'After when, as soon as, before and after, use the Present Simple for the future — no will.',
      ru: 'После when, as soon as, before и after будущее выражается через Present Simple — без will.',
      uk: 'Після when, as soon as, before та after майбутнє передається через Present Simple — без will.',
      de: 'Nach when, as soon as, before und after steht für die Zukunft das Present Simple — ohne will.',
    },
    practice: choice("I'll call you when I ___ home.", ['will get', 'got', 'getting', 'get'], 3),
  },
  {
    slug: 'if_present_imperative',
    level: 'B1',
    pattern: 'If + Present Simple, imperative',
    example: 'If you see Tom, say hello.',
    explanation: {
      en: 'An if-clause in the Present Simple can be followed by an instruction: If you see her, call me.',
      ru: 'После придаточного с if в Present Simple может идти просьба или указание: If you see her, call me.',
      uk: 'Після підрядного з if у Present Simple може йти прохання чи вказівка: If you see her, call me.',
      de: 'Auf einen if-Satz im Present Simple kann eine Aufforderung folgen: If you see her, call me.',
    },
    practice: choice(
      'If you ___ the answer, put up your hand.',
      ['will know', 'knew', 'know', 'knowing'],
      2,
    ),
  },
  {
    slug: 'first_negative_if',
    level: 'B1',
    pattern: "If + don't / doesn't + V1, will …",
    example: "If it doesn't rain, we'll go to the beach.",
    explanation: {
      en: "A negative if-clause uses don't/doesn't + base verb — not won't.",
      ru: "Отрицательное придаточное с if: don't/doesn't + начальная форма, а не won't.",
      uk: "Заперечне підрядне з if: don't/doesn't + початкова форма, а не won't.",
      de: "Ein verneinter if-Satz nimmt don't/doesn't + Grundform, nicht won't.",
    },
    practice: cloze(
      "If it ___ tomorrow, we'll go to the beach. (not / rain)",
      "doesn't rain",
      'does not rain',
    ),
  },
  {
    slug: 'may_might_in_result',
    level: 'B1',
    pattern: 'If + Present Simple, may / might + V1',
    example: 'If you work hard, you might get a promotion.',
    explanation: {
      en: 'Use may or might instead of will when the result is possible but not certain.',
      ru: 'Если результат возможен, но не точен, вместо will используйте may или might.',
      uk: 'Якщо результат можливий, але не певний, замість will вживайте may або might.',
      de: 'Ist das Ergebnis möglich, aber nicht sicher, nimm may oder might statt will.',
    },
    practice: choice(
      'If you work hard, you ___ get a promotion.',
      ['might', 'would', 'will to', 'are'],
      0,
    ),
  },
  {
    slug: 'unless_positive_verb',
    level: 'B1',
    pattern: 'unless + positive verb',
    example: "Unless you leave now, you'll be late.",
    contrast: "Unless you don't leave now, you'll be late. (wrong)",
    explanation: {
      en: 'unless already means if … not, so the verb after it is positive.',
      ru: 'unless уже значит if … not, поэтому глагол после него утвердительный.',
      uk: 'unless уже означає if … not, тому дієслово після нього стверджувальне.',
      de: 'unless bedeutet schon if … not, deshalb ist das Verb danach bejaht.',
    },
    practice: choice(
      "Unless you ___ now, you'll be late.",
      ["don't leave", "won't leave", 'leave', 'left'],
      2,
    ),
  },
  {
    slug: 'first_question_result',
    level: 'B1',
    pattern: 'What will you do if + Present Simple?',
    example: 'What will you do if you miss the last train?',
    explanation: {
      en: 'A question about a real future result: will in the main clause, the Present Simple after if.',
      ru: 'Вопрос о реальном результате в будущем: will в главной части, Present Simple после if.',
      uk: 'Питання про реальний результат у майбутньому: will у головній частині, Present Simple після if.',
      de: 'Frage nach einem realen Ergebnis in der Zukunft: will im Hauptsatz, Present Simple nach if.',
    },
    practice: choice(
      'What ___ if you miss the last train?',
      ['will you do', 'do you will', 'you will do', 'would you do'],
      0,
    ),
  },
]);
