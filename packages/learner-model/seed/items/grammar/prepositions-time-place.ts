import { choice } from '../practice';
import { grammarItems } from './gp';

export const PREPOSITIONS_TIME_PLACE = grammarItems('grammar.prepositions_time_place', [
  {
    slug: 'in_time',
    level: 'A2',
    pattern: 'in + month/year/season/parts of day',
    example: 'in July, in 2026, in winter, in the morning',
    explanation: {
      en: 'in for longer periods: months, years, seasons, parts of the day.',
      ru: 'in для длительных периодов: месяцы, годы, сезоны, части дня.',
    },
    practice: choice('My birthday is ___ July.', ['on', 'in', 'at'], 1),
  },
  {
    slug: 'on_time',
    level: 'A2',
    pattern: 'on + day/date',
    example: 'on Monday, on 5 May, on my birthday',
    explanation: { en: 'on for days and dates.', ru: 'on для дней недели и дат.' },
    practice: choice('The meeting is ___ Monday.', ['on', 'at', 'in'], 0),
  },
  {
    slug: 'at_time',
    level: 'A2',
    pattern: 'at + clock time/points',
    example: "at 7 o'clock, at noon, at night, at the weekend",
    explanation: {
      en: 'at for precise points in time and fixed expressions (at night).',
      ru: 'at для точного времени и устойчивых выражений (at night).',
    },
    practice: choice("The film starts ___ 7 o'clock.", ['in', 'on', 'at'], 2),
  },
  {
    slug: 'in_on_at_place',
    level: 'A2',
    pattern: 'in (enclosed) / on (surface) / at (point)',
    example: 'in the room, on the table, at the bus stop',
    explanation: {
      en: 'in = inside a space, on = on a surface, at = at a point/location.',
      ru: 'in = внутри пространства, on = на поверхности, at = в точке/месте.',
    },
    practice: choice("I'll wait for you ___ the bus stop.", ['at', 'on', 'in'], 0),
  },
]);
