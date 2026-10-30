import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const CONDITIONAL_2 = grammarItems('grammar.conditional_2', [
  {
    slug: 'if_past_would',
    level: 'B1',
    pattern: 'If + Past Simple, would + V1',
    example: 'If I had a car, I would drive to work.',
    explanation: {
      en: 'Second conditional: an unreal or unlikely situation now or in the future.',
      ru: 'Второй тип: нереальная или маловероятная ситуация сейчас или в будущем.',
      uk: 'Second conditional: нереальна або малоймовірна ситуація зараз чи в майбутньому.',
      de: 'Second Conditional: eine unwirkliche oder unwahrscheinliche Situation jetzt oder in der Zukunft.',
    },
    practice: choice(
      "If they ___ closer to the city, they wouldn't need a car — but they live in the country.",
      ['live', 'lived', 'would live', 'have lived'],
      1,
    ),
  },
  {
    slug: 'would_in_main',
    level: 'B1',
    pattern: 'main clause: would / could + V1',
    example: 'If we lived nearer, we could visit more often.',
    explanation: {
      en: 'The result clause takes would (or could/might) + base form.',
      ru: 'В главной части — would (или could/might) + первая форма.',
      uk: 'У головній частині — would (або could/might) + початкова форма.',
      de: 'Im Hauptsatz steht would (oder could/might) + Grundform.',
    },
    practice: choice(
      'If I won the lottery, I ___ a house by the sea.',
      ['would buy', 'will buy', 'bought', 'have bought'],
      0,
    ),
  },
  {
    slug: 'were_all_persons',
    level: 'B1',
    pattern: 'If I / he / she / it were…',
    example: 'If I were you, I would apologise.',
    explanation: {
      en: 'In the second conditional, were is used for every person, as in "If I were you".',
      ru: 'Во втором типе were употребляется со всеми лицами: «If I were you».',
      uk: 'У second conditional were вживається з усіма особами: «If I were you».',
      de: 'Im Second Conditional steht were bei allen Personen: „If I were you“.',
    },
    // No "was": "If I was you" is common in speech.
    practice: choice('If I ___ you, I would take the job.', ['am', 'be', 'will be', 'were'], 3),
  },
  {
    slug: 'no_would_in_if',
    level: 'B1',
    pattern: 'if-clause: Past Simple, never would',
    example: 'If it were cheaper, I would buy it.',
    contrast: 'If it would be cheaper, I would buy it. (wrong)',
    explanation: {
      en: 'The if-clause never takes would.',
      ru: 'В придаточном с if would не бывает.',
      uk: 'У підрядному з if would не буває.',
      de: 'Im if-Satz steht nie would.',
    },
    practice: cloze('If I ___ her number, I would call her. (know)', 'knew'),
  },
  {
    slug: 'wouldnt_negative',
    level: 'B1',
    pattern: "If + Past Simple, wouldn't + V1",
    example: "If I had more money, I wouldn't live here.",
    explanation: {
      en: "The negative result is wouldn't + base verb.",
      ru: "Отрицательный результат: wouldn't + начальная форма.",
      uk: "Заперечний результат: wouldn't + початкова форма.",
      de: "Das verneinte Ergebnis ist wouldn't + Grundform.",
    },
    practice: choice(
      'If I had more money, I ___ in this tiny flat.',
      ["won't live", "didn't live", "wouldn't live", "don't live"],
      2,
    ),
  },
  {
    slug: 'if_negative_werent',
    level: 'B1',
    pattern: "If + weren't / didn't + V1",
    example: "If I weren't so tired, I'd come with you.",
    explanation: {
      en: "A negative if-clause takes the Past Simple: weren't (or wasn't), didn't + base verb.",
      ru: "Отрицательное придаточное с if — в Past Simple: weren't (или wasn't), didn't + начальная форма.",
      uk: "Заперечне підрядне з if — у Past Simple: weren't (або wasn't), didn't + початкова форма.",
      de: "Ein verneinter if-Satz steht im Past Simple: weren't (oder wasn't), didn't + Grundform.",
    },
    practice: cloze(
      'If I ___ so tired, I would come with you. (not / be)',
      "weren't",
      "wasn't",
      'were not',
      'was not',
    ),
  },
  {
    slug: 'question_would_you_do',
    level: 'B1',
    pattern: 'What would you do if + Past Simple?',
    example: 'What would you do if you found a wallet?',
    explanation: {
      en: 'To ask about an imagined situation, use would in the question and the Past Simple after if.',
      ru: 'Вопрос о воображаемой ситуации: would в вопросе, Past Simple после if.',
      uk: 'Питання про уявну ситуацію: would у питанні, Past Simple після if.',
      de: 'Fragen zu einer gedachten Situation: would in der Frage, Past Simple nach if.',
    },
    practice: choice(
      'What ___ if you found a wallet in the street?',
      ['will you do', 'did you do', 'you would do', 'would you do'],
      3,
    ),
  },
  {
    slug: 'might_in_main',
    level: 'B1',
    pattern: 'If + Past Simple, might + V1',
    example: 'If we left now, we might catch the train.',
    explanation: {
      en: 'might in the result clause makes an imagined result less certain than would.',
      ru: 'might в главной части делает воображаемый результат менее уверенным, чем would.',
      uk: 'might у головній частині робить уявний результат менш певним, ніж would.',
      de: 'might im Hauptsatz macht das gedachte Ergebnis unsicherer als would.',
    },
    practice: choice(
      'If we left now, we ___ catch the last train.',
      ['will', 'might', 'can', 'are'],
      1,
    ),
  },
  {
    slug: 'could_in_if',
    level: 'B1',
    pattern: 'If + could + V1, would + V1',
    example: 'If I could fly, I would fly to work.',
    explanation: {
      en: 'could in the if-clause is the past of can, for an ability you do not have: If I could …, I would …',
      ru: 'could в придаточном с if — прошедшая форма can для умения, которого нет: If I could …, I would …',
      uk: 'could у підрядному з if — минула форма can для вміння, якого немає: If I could …, I would …',
      de: 'could im if-Satz ist die Vergangenheitsform von can für eine Fähigkeit, die man nicht hat: If I could …, I would …',
    },
    practice: choice(
      'If I could speak Chinese, I ___ a job in Beijing.',
      ['would get', 'will get', 'get', 'got'],
      0,
    ),
  },
  {
    slug: 'result_clause_first',
    level: 'B1',
    pattern: 'would + V1 + if + Past Simple',
    example: 'I would help you if I had more time.',
    explanation: {
      en: 'The result can come first; the if-clause still takes the Past Simple, and no comma is needed.',
      ru: 'Результат может стоять первым; придаточное с if всё равно в Past Simple, запятая не нужна.',
      uk: 'Результат може стояти першим; підрядне з if однаково в Past Simple, кома не потрібна.',
      de: 'Das Ergebnis kann vorne stehen; der if-Satz bleibt im Past Simple, ein Komma ist nicht nötig.',
    },
    practice: choice(
      'I would help you if I ___ more time.',
      ['have', 'would have', 'had', 'will have'],
      2,
    ),
  },
]);
